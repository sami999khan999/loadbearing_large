import {
  type ArchivedPartition,
  type Container,
  type Job,
  type OrganizationId,
  PartitionedTable,
  type PartitionedTableEntry,
  type PartitionedTableName,
  QueueName,
  type Redis,
  Worker,
} from "../import.js";

// The consumer whose absence meant `cleanup-daily` registered every boot and never ran,
// accumulating silently. See docs/reference/consumers.md.
export class MaintenanceConsumer {
  // A count of partitions per run, not months of runway: three is the current month and
  // the next two, so two consecutive missed runs survive and the third is an outage.
  private static readonly MONTHS_PER_RUN = 3;

  // Below this, say so — and **before** ensuring, never after. `MONTHS_PER_RUN` always
  // leaves two months ahead, so a check after it could never fire.
  private static readonly MIN_MONTHS_AHEAD = 2;

  // Tenants read per page from the catalog. The runway is per tenant now, so this loop
  // is tenants x three tables of DDL a month — paced, never held in one transaction.
  private static readonly TENANT_PAGE = 200;

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
  ) {}

  public start(): Worker {
    const worker = new Worker(
      QueueName.MAINTENANCE,
      async (job: Job) => this.handle(job),
      // Serial by default: these jobs take table-level locks and can deadlock on the
      // same partition.
      { connection: this.connection, concurrency: this.concurrency },
    );

    worker.on("failed", (job, error) => {
      // Two lines, and they answer different questions. This one is the countable
      // signal: one `event_code`, so queue health is a rate rather than a grep.
      this.container.logger.emit("queue.job.failed", {
        queue: QueueName.MAINTENANCE,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });

      // And this one is the diagnosis — normalised code, cause and stack, at the level
      // the error catalog decides.
      this.container.logger.failure(error, {
        queue: QueueName.MAINTENANCE,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });
    });

    worker.on("completed", (job) => {
      this.container.logger.emit("queue.job.completed", {
        queue: QueueName.MAINTENANCE,
        jobId: job.id ?? "unknown",
        durationMs: Math.max(0, (job.finishedOn ?? 0) - (job.processedOn ?? 0)),
      });
    });

    worker.on("stalled", (jobId) => {
      this.container.logger.emit("queue.job.stalled", { queue: QueueName.MAINTENANCE, jobId });
    });

    return worker;
  }

  // An unknown job name throws rather than succeeding quietly. Public, because this and
  // not `start()` is the unit of work — a private handler no test can reach.
  public async handle(job: Job): Promise<void> {
    switch (job.name) {
      case "cleanup":
        return this.cleanup();
      case "partitions":
        return this.partitions();
      default:
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  }

  private async cleanup(): Promise<void> {
    const outcome = await this.container.maintenance.sweepExpired(this.container.clock.now());

    this.container.logger.emit("maintenance.sweep.completed", {
      sessions: outcome.sessions,
      verifications: outcome.verifications,
      invitations: outcome.invitations,
    });
  }

  // Every month-partitioned table from the allowlist: the runway first, per tenant where
  // it has a tenant level, then the retention pass once for the table.
  private async partitions(): Promise<void> {
    for (const entry of PartitionedTable.MONTH_PARTITIONED) {
      await this.ensure(entry);
      await this.prune(entry.name);
    }
  }

  // The runway, walked per tenant. That product is what bounds how many tenants a node
  // carries.
  private async ensure(entry: PartitionedTableEntry & { name: PartitionedTableName }) {
    if (!entry.tenantKey) {
      await this.partitionsFor(entry.name, null);
      return;
    }

    let after: OrganizationId | null = null;

    for (;;) {
      const page = await this.container.organizations.page(after, MaintenanceConsumer.TENANT_PAGE);
      if (page.length === 0) break;

      for (const organizationId of page) await this.partitionsFor(entry.name, organizationId);

      after = page[page.length - 1] ?? null;
      if (page.length < MaintenanceConsumer.TENANT_PAGE) break;
    }
  }

  // One table, one tenant. A bounded unit of DDL, so a month's worth is a slow trickle
  // rather than one lock storm on the first of the month.
  private async partitionsFor(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
  ): Promise<void> {
    const now = this.container.clock.now();

    // Read *before* ensuring: this run is about to fix the runway, so afterwards there
    // is nothing to report. That it had to is what the operator needs to know.
    const monthsAhead = await this.container.maintenance.monthlyPartitionsAfter(
      table,
      organizationId,
      now,
    );
    if (monthsAhead < MaintenanceConsumer.MIN_MONTHS_AHEAD) {
      this.container.logger.emit("partition.runway.low", {
        table,
        organizationId: organizationId ?? "",
        monthsAhead,
      });
    }

    const created = await this.container.maintenance.ensureMonthlyPartitions(
      table,
      organizationId,
      now,
      MaintenanceConsumer.MONTHS_PER_RUN,
    );

    // One line per table per tenant, and both are fields rather than part of the code:
    // the event catalog is the cardinality budget for the `event_code` label.
    this.container.logger.emit("maintenance.partitions.ensured", {
      table,
      organizationId: organizationId ?? "",
      created: created.length,
      months: MaintenanceConsumer.MONTHS_PER_RUN,
    });
  }

  private async outboxIsBehind(cutoff: Date): Promise<boolean> {
    const oldest = await this.container.outbox.oldestPendingAt();
    return oldest !== null && oldest < cutoff;
  }

  // Archive, then drop — never one without the other. Retention stops meaning deletion
  // here: every month leaves for cold storage and is dropped behind a verified object.
  private async prune(table: PartitionedTableName): Promise<void> {
    // From the table's own entry, not a record beside it: the next partitioned table is
    // one line in the allowlist rather than one line in two places that can disagree.
    const months = PartitionedTable.byName(table).retentionMonths;
    if (months === null) return;

    const now = this.container.clock.now();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));

    // Only the outbox has a notion of "not yet handled", and a stuck event must never be
    // archived out from under the drain. One table's guard, never every table's.
    if (table === PartitionedTable.OUTBOX_EVENT && (await this.outboxIsBehind(cutoff))) return;

    for (const period of await this.periodsBefore(table, cutoff)) {
      await this.archivePeriod(table, period);
    }
  }

  // Distinct months, oldest first, across every tenant. The read is the same one the
  // retention preview makes, so the screen and the job cannot disagree about what exists.
  private async periodsBefore(table: PartitionedTableName, cutoff: Date): Promise<readonly Date[]> {
    const estimates = await this.container.maintenance.partitionsBefore(table, cutoff);
    const periods = new Map<number, Date>();

    for (const estimate of estimates) periods.set(estimate.period.getTime(), estimate.period);

    return [...periods.values()].sort((a, b) => a.getTime() - b.getTime());
  }

  // One table-month. A failure here is logged and the loop continues: one month whose
  // upload failed must not stop the months after it, and nothing was dropped.
  private async archivePeriod(table: PartitionedTableName, period: Date): Promise<void> {
    try {
      const archived = await this.container.partitionArchive.archive(table, period);
      const rows = archived.objects.reduce((total, object) => total + object.rowCount, 0);

      // One line per table-month, not one per tenant object: a month with five thousand
      // tenants would otherwise be five thousand lines.
      this.container.logger.emit("maintenance.partition.archived", {
        table,
        period: archived.period,
        objects: archived.objects.length,
        rows,
      });

      for (const partition of archived.dropped) {
        this.container.logger.emit("maintenance.partition.dropped", { table, partition });
      }

      await this.stampProjected(table, period, archived);
    } catch (error: unknown) {
      this.container.logger.failure(error, { table, period: period.toISOString() });
    }
  }

  // Only the audit trail reaches ClickHouse, so only its months can have a hole — and a
  // month is archived and dropped either way, so a forgotten switch costs a known gap.
  private async stampProjected(
    table: PartitionedTableName,
    period: Date,
    archived: ArchivedPartition,
  ): Promise<void> {
    if (table !== PartitionedTable.ACTIVITY_LOG || archived.objects.length === 0) return;

    if (!this.container.hasProjector) {
      this.container.logger.emit("analytics.projection.gap", {
        period: archived.period,
        reason: "disabled",
      });
      return;
    }

    // Strictly after the month, because a checkpoint inside it has projected part of the
    // month and stamping that row would claim the whole of it.
    const end = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
    let behind = false;

    for (const object of archived.objects) {
      const checkpoint = await this.container.projector.checkpoint(object.organizationId);
      const at = checkpoint.lastOccurredAt;

      if (at === null || at.getTime() < end.getTime()) {
        behind = true;
        continue;
      }

      await this.container.partitionArchive.markProjected(table, period, object.organizationId);
    }

    if (behind) {
      this.container.logger.emit("analytics.projection.gap", {
        period: archived.period,
        reason: "behind",
      });
    }
  }
}

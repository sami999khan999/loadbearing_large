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
  type RetentionPolicyRecord,
  RetentionRules,
  type TenantRetentionPolicyRecord,
  Worker,
} from "../import.js";

// What `cold-restore` carries. A closed shape rather than the job's `unknown`, checked
// at the one place the payload crosses from the queue into typed code.
interface RestoreJob {
  readonly table: PartitionedTableName;
  readonly period: string;
  readonly organizationId: OrganizationId | null;
}

// What `tenant-export` carries. The day comes from the request rather than the clock, so
// a retry the next morning writes the objects the job id already claimed.
interface ExportJob {
  readonly organizationId: OrganizationId;
  readonly day: string;
}

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

  // Days a deleted tenant's objects stay. The delete is recoverable for that long and
  // not a minute more, which is the whole reason cold storage is not cascaded.
  private static readonly DELETED_TENANT_DAYS = 30;

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
      case "retention":
        return this.retention();
      case "cold-restore":
        return this.restore(job.data as RestoreJob);
      case "tenant-export":
        return this.export(job.data as ExportJob);
      default:
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  }

  // One tenant-month per object, into a scratch table — `17.4`'s rule, and the one
  // case where attaching is right is below.
  private async restore(data: RestoreJob): Promise<void> {
    const table = data.table;
    const period = new Date(`${data.period}T00:00:00.000Z`);
    const entries = await this.container.partitionArchive.entriesFor(
      table,
      data.period,
      data.organizationId ?? undefined,
    );

    // The hot window, from the row if there is one and the allowlist if not — the same
    // resolution `prune()` does, because the two have to agree about what "hot" means.
    const policy = await this.container.retentionPolicies.findBy("postgres", table);
    const months = policy?.hotMonths ?? PartitionedTable.byName(table).retentionMonths;
    const now = this.container.clock.now();
    const cutoff =
      months === null
        ? null
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));

    // Inside the window, the retention pass will not argue with it. Outside, the
    // scratch table stays as evidence — nothing sweeps it, on purpose.
    const inWindow = cutoff === null || period.getTime() >= cutoff.getTime();

    for (const entry of entries) {
      const restored = await this.container.partitionArchive.restore(
        table,
        period,
        entry.organizationId,
      );

      if (inWindow) {
        await this.container.maintenance.attachMonthlyPartition(
          table,
          PartitionedTable.byName(table).tenantKey ? entry.organizationId : null,
          period,
          restored.scratchTable,
        );
      }

      this.container.logger.emit("cold.partition.restored", {
        table,
        period: restored.period,
        organizationId: entry.organizationId,
        rows: restored.rowCount,
        attached: inWindow,
      });
    }
  }

  // One object per tenant-owned table, plus the catalog, plus a manifest — live rows,
  // so an export never takes the tenant's data offline.
  private async export(data: ExportJob): Promise<void> {
    const exported = await this.container.partitionArchive.exportTenant(
      data.organizationId,
      new Date(`${data.day}T00:00:00.000Z`),
    );

    // One line per export, not one per object: nine lines a run would be nine lines
    // saying the same thing, and the counts are what an operator reads.
    this.container.logger.emit("cold.tenant.exported", {
      organizationId: data.organizationId,
      objects: exported.objects.length,
      rows: exported.objects.reduce((total, object) => total + object.rowCount, 0),
      bytes: exported.objects.reduce((total, object) => total + object.bytes, 0),
    });
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
    // One query for the whole run rather than one per table. An absent row is the code
    // default, so this map is usually empty and the allowlist answers everything.
    const rows = await this.container.retentionPolicies.forPostgres();

    for (const entry of PartitionedTable.MONTH_PARTITIONED) {
      await this.ensure(entry);
      await this.prune(entry.name, rows.get(entry.name));
    }
  }

  // The daily converger. Neither store is written by a save alone: the call after the
  // commit can fail, and a rule deleted by hand in a console is drift nothing else sees.
  private async retention(): Promise<void> {
    const rows = await this.container.retentionPolicies.all();

    await this.convergeLifecycle(rows);
    await this.convergeClickHouse(rows);
    await this.expireArchiveRows(rows);
    await this.sweepDeletedTenants();
  }

  private async convergeLifecycle(rows: readonly RetentionPolicyRecord[]): Promise<void> {
    const expected = RetentionRules.lifecycleFor(rows);
    const actual = await this.container.storagePolicy.lifecycle();
    if (RetentionRules.lifecycleMatches(expected, actual)) return;

    // Drift first, then the repair. A lone `applied` cannot tell "the reconcile is
    // doing its job" from "somebody edited the bucket by hand last night".
    this.container.logger.emit("retention.lifecycle.drifted", {
      expected: MaintenanceConsumer.serialise(expected),
      actual: MaintenanceConsumer.serialise(actual),
    });

    await this.container.storagePolicy.applyLifecycle(expected);
    this.container.logger.emit("retention.lifecycle.applied", { rules: expected.length });
  }

  // Compared before it is written, because `MODIFY TTL` materialises on every existing
  // part — on a years-deep table that is a rewrite, and a daily one would never finish.
  private async convergeClickHouse(rows: readonly RetentionPolicyRecord[]): Promise<void> {
    if (!this.container.hasProjector) return;

    // Both tables, composed by the same function the screen and the save use: three
    // callers composing the same string by hand is three places for it to drift.
    const expression = RetentionRules.clickhouseTtlFrom(
      rows,
      await this.container.projectionPolicies.all(),
    );

    if ((await this.container.projector.retention()) === expression) return;

    await this.container.projector.applyRetention(expression);
    this.container.logger.emit("analytics.retention.applied", { expression });
  }

  // A row pointing at an object the bucket already expired is a `NotFoundError` on the
  // archived read. Deleted after the rule that removed the object, never before.
  private async expireArchiveRows(rows: readonly RetentionPolicyRecord[]): Promise<void> {
    const now = this.container.clock.now();

    for (const row of rows) {
      if (row.store !== "postgres" || row.coldMonths === null) continue;
      if (!MaintenanceConsumer.isPartitioned(row.tableName)) continue;

      const cutoff = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (row.hotMonths + row.coldMonths), 1),
      );

      const expired = await this.container.partitionArchive.forget(row.tableName, cutoff);
      if (expired === 0) continue;

      this.container.logger.emit("retention.rows.expired", {
        table: row.tableName,
        rows: expired,
      });
    }
  }

  // Postgres forgot these tenants when their row was deleted; the bucket has not. The
  // thirty days are the recovery window, and this is what ends it.
  private async sweepDeletedTenants(): Promise<void> {
    const now = this.container.clock.now();
    const before = new Date(
      now.getTime() - MaintenanceConsumer.DELETED_TENANT_DAYS * 24 * 60 * 60 * 1000,
    );

    const swept = await this.container.partitionArchive.sweepDeleted(before);
    if (swept.objects === 0) return;

    this.container.logger.emit("cold.objects.swept", { reason: "tenant_deleted", ...swept });
  }

  // The closed union, checked rather than cast: a row naming a table the allowlist no
  // longer has must not reach a method that inlines the name into DDL.
  private static isPartitioned(table: string): table is PartitionedTableName {
    return (PartitionedTable.NAMES as readonly string[]).includes(table);
  }

  private static serialise(rules: readonly { prefix: string; expireAfterDays: number }[]): string {
    return [...rules]
      .sort((left, right) => left.prefix.localeCompare(right.prefix))
      .map((rule) => `${rule.prefix}=${rule.expireAfterDays}`)
      .join("|");
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
  private async prune(
    table: PartitionedTableName,
    policy: RetentionPolicyRecord | undefined,
  ): Promise<void> {
    // The row, then the allowlist. An absent row **is** the code default, which is what
    // makes an empty `retention_policy` behave exactly as the deploy before it did.
    const months = policy?.hotMonths ?? PartitionedTable.byName(table).retentionMonths;
    if (months === null) return;

    const now = this.container.clock.now();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));

    // Only the outbox has a notion of "not yet handled", and a stuck event must never be
    // archived out from under the drain. One table's guard, never every table's.
    if (table === PartitionedTable.OUTBOX_EVENT && (await this.outboxIsBehind(cutoff))) return;

    // `drop` destroys the month rather than archiving it, which is a table of transport
    // rows deciding it is not worth the bytes. The outbox guard above still applies.
    if (policy?.coldMode === "drop") {
      for (const partition of await this.container.maintenance.dropMonthlyPartitionsBefore(
        table,
        null,
        cutoff,
      )) {
        this.container.logger.emit("maintenance.partition.dropped", { table, partition });
      }
      return;
    }

    // Overrides make a table's cutoff differ per tenant, so the pass walks them. Usually
    // there are none, and the common case stays one call per table-month.
    const overrides = await this.container.tenantRetentionPolicies.forTable(table);
    if (overrides.size > 0) {
      await this.pruneByTenant(table, months, overrides);
      return;
    }

    for (const period of await this.periodsBefore(table, cutoff)) {
      await this.archivePeriod(table, period);
    }
  }

  // `override ?? retention_policy row ?? allowlist`, resolved per tenant. The default
  // months are already resolved by the caller, which is the middle two of the three.
  private async pruneByTenant(
    table: PartitionedTableName,
    defaultMonths: number,
    overrides: ReadonlyMap<OrganizationId, TenantRetentionPolicyRecord>,
  ): Promise<void> {
    const now = this.container.clock.now();
    let after: OrganizationId | null = null;

    for (;;) {
      const page = await this.container.organizations.page(after, MaintenanceConsumer.TENANT_PAGE);
      if (page.length === 0) break;

      for (const organizationId of page) {
        const months = overrides.get(organizationId)?.hotMonths ?? defaultMonths;
        const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));

        for (const period of await this.periodsBefore(table, cutoff, organizationId)) {
          await this.archivePeriod(table, period, organizationId);
        }
      }

      after = page[page.length - 1] ?? null;
      if (page.length < MaintenanceConsumer.TENANT_PAGE) break;
    }
  }

  // Distinct months, oldest first, across every tenant. The read is the same one the
  // retention preview makes, so the screen and the job cannot disagree about what exists.
  private async periodsBefore(
    table: PartitionedTableName,
    cutoff: Date,
    organizationId?: OrganizationId,
  ): Promise<readonly Date[]> {
    const estimates = await this.container.maintenance.partitionsBefore(
      table,
      cutoff,
      organizationId,
    );
    const periods = new Map<number, Date>();

    for (const estimate of estimates) periods.set(estimate.period.getTime(), estimate.period);

    return [...periods.values()].sort((a, b) => a.getTime() - b.getTime());
  }

  // One table-month. A failure here is logged and the loop continues: one month whose
  // upload failed must not stop the months after it, and nothing was dropped.
  private async archivePeriod(
    table: PartitionedTableName,
    period: Date,
    organizationId?: OrganizationId,
  ): Promise<void> {
    try {
      const archived = await this.container.partitionArchive.archive(table, period, organizationId);
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

    // Paused counts as disabled here, and asking for a checkpoint while paused is a
    // query whose answer cannot have moved since the pause.
    const paused =
      this.container.hasProjector && !(await this.container.platformPolicy.get()).projectionEnabled;

    if (!this.container.hasProjector || paused) {
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

import {
  type ActivityAction,
  type Container,
  type Job,
  type OrganizationId,
  type ProjectionCheckpoint,
  QueueName,
  type Redis,
  Worker,
} from "../import.js";

// What makes ClickHouse derived rather than authoritative: `project` moves the rows and
// `reconcile` notices when it has not. See docs/reference/consumers.md.
export class AnalyticsConsumer {
  // Large enough that ClickHouse merges a few big parts rather than many small ones —
  // see docs/reference/consumers.md.
  private static readonly BATCH_SIZE = 5_000;

  // A ceiling on one job, not on the backlog, and total across tenants: one busy tenant
  // cannot make the run cost tenants x batches.
  private static readonly MAX_BATCHES_PER_RUN = 20;

  // Tenants read per page from the catalog, the same page size the maintenance consumer
  // walks them in.
  private static readonly TENANT_PAGE = 200;

  // Two runs of the schedule: one late run is a slow batch, two is a consumer that has
  // stopped.
  private static readonly LAG_WARNING_MS = 10 * 60 * 1_000;

  // Long enough to catch a consumer that died over a weekend, short enough that the
  // comparison is two cheap aggregates.
  private static readonly RECONCILE_DAYS = 7;

  // The label on every line this file emits, so a second projection does not change the
  // event shape and a dashboard filters on it rather than on the queue name.
  private static readonly PROJECTION = "activity_events";

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
  ) {}

  public start(): Worker {
    const worker = new Worker(
      QueueName.ANALYTICS,
      async (job: Job) => this.handle(job),
      // Serial regardless of what is configured elsewhere: correctness rests on there
      // being one writer, not on the insert being idempotent.
      { connection: this.connection, concurrency: this.concurrency },
    );

    worker.on("failed", (job, error) => {
      // Two lines, and they answer different questions. This one is the countable
      // signal: one `event_code`, so queue health is a rate rather than a grep.
      this.container.logger.emit("queue.job.failed", {
        queue: QueueName.ANALYTICS,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });

      // And this one is the diagnosis — normalised code, cause and stack, at the level
      // the error catalog decides.
      this.container.logger.failure(error, {
        queue: QueueName.ANALYTICS,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });
    });

    worker.on("stalled", (jobId) => {
      this.container.logger.emit("queue.job.stalled", { queue: QueueName.ANALYTICS, jobId });
    });

    return worker;
  }

  public async handle(job: Job): Promise<void> {
    switch (job.name) {
      case "project":
        return this.project();
      case "reconcile":
        return this.reconcile();
      default:
        throw new Error(`Unknown analytics job: ${job.name}`);
    }
  }

  // Per tenant in both stores since `0023`: a walk with no tenant predicate appends every
  // tenant's months into every batch.
  private async project(): Promise<void> {
    const startedAt = this.container.clock.now();
    // Once per run, not per tenant: it is one small table and every tenant's walk
    // subtracts the same list.
    const excluding = await this.excluded();

    let projected = 0;
    let batches = 0;
    let lagMs = 0;
    let tenants = 0;
    let after: OrganizationId | null = null;

    for (;;) {
      const page = await this.container.organizations.page(after, AnalyticsConsumer.TENANT_PAGE);
      if (page.length === 0) break;

      for (const organizationId of page) {
        tenants += 1;
        if (batches >= AnalyticsConsumer.MAX_BATCHES_PER_RUN) continue;

        const outcome = await this.projectTenantOrReport(
          organizationId,
          AnalyticsConsumer.MAX_BATCHES_PER_RUN - batches,
          excluding,
        );
        projected += outcome.projected;
        batches += outcome.batches;
        // The max over tenants, not the last one's: the run is as far behind as its
        // furthest-behind tenant.
        lagMs = Math.max(lagMs, outcome.lagMs);
      }

      after = page[page.length - 1] ?? null;
      if (page.length < AnalyticsConsumer.TENANT_PAGE) break;
    }

    const now = this.container.clock.now();
    const lagSeconds = Math.round(lagMs / 1_000);

    this.container.logger.emit("analytics.projection.completed", {
      projection: AnalyticsConsumer.PROJECTION,
      tenants,
      events: projected,
      durationMs: now.getTime() - startedAt.getTime(),
      lagSeconds,
      capped: batches >= AnalyticsConsumer.MAX_BATCHES_PER_RUN,
    });

    // `warn`, not `debug`: a projection that throws is already an error line, and one
    // falling quietly behind produces nothing at all.
    if (lagMs > AnalyticsConsumer.LAG_WARNING_MS) {
      this.container.logger.emit("analytics.projection.lagged", {
        projection: AnalyticsConsumer.PROJECTION,
        lagSeconds,
        thresholdSeconds: AnalyticsConsumer.LAG_WARNING_MS / 1_000,
      });
    }
  }

  // The actions no longer projected. An absent row is "projected", so this is the
  // rows that say otherwise and usually none.
  private async excluded(): Promise<readonly ActivityAction[]> {
    const rows = await this.container.projectionPolicies.all();
    return rows.filter((row) => !row.projected).map((row) => row.action);
  }

  // Rethrows: BullMQ's retry is driven by rejection. Per tenant, because the checkpoint
  // is — there is no global "where the replay resumes" left to report.
  private async projectTenantOrReport(
    organizationId: OrganizationId,
    budget: number,
    excluding: readonly ActivityAction[],
  ): Promise<{ projected: number; batches: number; lagMs: number }> {
    try {
      return await this.projectTenant(organizationId, budget, excluding);
    } catch (error: unknown) {
      // Read after the throw rather than before it, so the failure line names where the
      // destination actually stands rather than where this run hoped to start.
      const checkpoint = await this.container.projector.checkpoint(organizationId);
      this.container.logger.emit("analytics.projection.failed", {
        projection: AnalyticsConsumer.PROJECTION,
        organizationId,
        eventId: checkpoint.lastId ?? "none",
      });
      throw error;
    }
  }

  // One tenant's walk, bounded by what is left of the run's batch budget. The checkpoint
  // advances because rows landed, never because a batch was acknowledged.
  private async projectTenant(
    organizationId: OrganizationId,
    budget: number,
    excluding: readonly ActivityAction[],
  ): Promise<{ projected: number; batches: number; lagMs: number }> {
    const projector = this.container.projector;
    let checkpoint = await projector.checkpoint(organizationId);
    let projected = 0;
    let batches = 0;
    let caughtUp = false;

    while (batches < budget) {
      const records = await this.container.activityReplay.since(
        organizationId,
        checkpoint,
        AnalyticsConsumer.BATCH_SIZE,
        excluding,
      );
      if (records.length === 0) {
        caughtUp = true;
        break;
      }

      projected += await projector.project(records);
      batches += 1;

      const last = records[records.length - 1];
      if (!last) break;
      checkpoint = { lastOccurredAt: last.occurredAt, lastId: last.id };

      // A short batch means caught up: continuing issues one more query to learn what
      // this length already said.
      if (records.length < AnalyticsConsumer.BATCH_SIZE) {
        caughtUp = true;
        break;
      }
    }

    const lagMs = await this.lagMs(organizationId, checkpoint, caughtUp, excluding);
    return { projected, batches, lagMs };
  }

  // The age of the oldest row still unprojected, never the age of the newest projected
  // one. See docs/reference/consumers.md for what each of those answers.
  private async lagMs(
    organizationId: OrganizationId,
    checkpoint: ProjectionCheckpoint,
    caughtUp: boolean,
    excluding: readonly ActivityAction[],
  ): Promise<number> {
    if (caughtUp) return 0;

    // The same exclusion: lag measured over rows that will never be projected is a
    // backlog that never shrinks and an alert that never clears.
    const [oldest] = await this.container.activityReplay.since(
      organizationId,
      checkpoint,
      1,
      excluding,
    );
    if (!oldest) return 0;
    return this.container.clock.now().getTime() - oldest.occurredAt.getTime();
  }

  // Counts per day on both sides and a diff, with today excluded because a difference in
  // it is timing rather than drift. See docs/reference/consumers.md.
  private async reconcile(): Promise<void> {
    const now = this.container.clock.now();
    const excluding = await this.excluded();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(to.getTime() - AnalyticsConsumer.RECONCILE_DAYS * 24 * 60 * 60 * 1_000);

    let days = 0;
    let drifted = 0;
    let after: OrganizationId | null = null;

    for (;;) {
      const page = await this.container.organizations.page(after, AnalyticsConsumer.TENANT_PAGE);
      if (page.length === 0) break;

      for (const organizationId of page) {
        const outcome = await this.reconcileTenant(organizationId, from, to, excluding);
        days += outcome.days;
        drifted += outcome.drifted;
      }

      after = page[page.length - 1] ?? null;
      if (page.length < AnalyticsConsumer.TENANT_PAGE) break;
    }

    // Emitted whether or not anything drifted. Returning early here made "reconciliation
    // is finding drift" and "the consumer stopped" the same absence on a dashboard.
    this.container.logger.emit("analytics.reconciliation.completed", {
      days,
      drifted,
      durationMs: this.container.clock.now().getTime() - now.getTime(),
    });
  }

  // One tenant's diff, and `excluding` goes to **both** sides: subtracted from one
  // only, every excluded row reads as drift on the run after it was excluded.
  private async reconcileTenant(
    organizationId: OrganizationId,
    from: Date,
    to: Date,
    excluding: readonly ActivityAction[],
  ): Promise<{ days: number; drifted: number }> {
    const [source, derived] = await Promise.all([
      this.container.activityReplay.dailyCounts(organizationId, from, to, excluding),
      this.container.projector.dailyCounts(organizationId, from, to, excluding),
    ]);

    const derivedByDay = new Map(derived.map((count) => [count.day, count.rows]));
    const drift = source
      .map((count) => ({
        day: count.day,
        source: count.rows,
        derived: derivedByDay.get(count.day) ?? 0,
      }))
      .filter((row) => row.source !== row.derived);

    // One line per drifting day, at `error`: every number shown since the first drifting
    // day is wrong, and the replay that fixes it has a deadline.
    for (const row of drift) {
      this.container.logger.emit("analytics.reconciliation.drifted", {
        organizationId,
        day: row.day,
        expected: row.source,
        actual: row.derived,
      });
    }

    return { days: source.length, drifted: drift.length };
  }
}

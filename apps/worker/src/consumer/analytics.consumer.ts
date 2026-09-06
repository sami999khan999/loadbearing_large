import { type Container, type Job, QueueName, type Redis, Worker } from "../import.js";

// What makes ClickHouse derived rather than authoritative: `project` moves the rows and
// `reconcile` notices when it has not. See docs/reference/consumers.md.
export class AnalyticsConsumer {
  // Large enough that ClickHouse merges a few big parts rather than many small ones —
  // see docs/reference/consumers.md.
  private static readonly BATCH_SIZE = 5_000;

  // A ceiling on one job, not on the backlog: the checkpoint means the next run resumes
  // exactly where this one ended.
  private static readonly MAX_BATCHES_PER_RUN = 20;

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
        return this.projectOrReport();
      case "reconcile":
        return this.reconcile();
      default:
        throw new Error(`Unknown analytics job: ${job.name}`);
    }
  }

  // Rethrows: BullMQ's retry is driven by rejection, so the line is a report and never
  // a `catch` that swallows.
  private async projectOrReport(): Promise<void> {
    // Read before the run rather than after the throw, because the destination is what
    // a failed run cannot be asked. It is where the replay resumes.
    const checkpoint = await this.container.projector.checkpoint();

    try {
      await this.project();
    } catch (error: unknown) {
      this.container.logger.emit("analytics.projection.failed", {
        projection: AnalyticsConsumer.PROJECTION,
        eventId: checkpoint.lastId ?? "none",
      });
      throw error;
    }
  }

  // The checkpoint advances because rows landed, never because a batch was acknowledged,
  // so a projector that failed mid-insert resumes from what is in the table.
  private async project(): Promise<void> {
    const projector = this.container.projector;
    const startedAt = this.container.clock.now();

    let checkpoint = await projector.checkpoint();
    let projected = 0;
    let batches = 0;

    while (batches < AnalyticsConsumer.MAX_BATCHES_PER_RUN) {
      const records = await this.container.activityReplay.since(
        checkpoint,
        AnalyticsConsumer.BATCH_SIZE,
      );
      if (records.length === 0) break;

      projected += await projector.project(records);
      batches += 1;

      const last = records[records.length - 1];
      if (!last) break;
      checkpoint = { lastOccurredAt: last.occurredAt, lastId: last.id };

      // A short batch means caught up: continuing issues one more query to learn what
      // this length already said.
      if (records.length < AnalyticsConsumer.BATCH_SIZE) break;
    }

    const now = this.container.clock.now();
    const lagMs = checkpoint.lastOccurredAt
      ? now.getTime() - checkpoint.lastOccurredAt.getTime()
      : 0;
    const lagSeconds = Math.round(lagMs / 1_000);

    this.container.logger.emit("analytics.projection.completed", {
      projection: AnalyticsConsumer.PROJECTION,
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

  // Counts per day on both sides and a diff, with today excluded because a difference in
  // it is timing rather than drift. See docs/reference/consumers.md.
  private async reconcile(): Promise<void> {
    const now = this.container.clock.now();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(to.getTime() - AnalyticsConsumer.RECONCILE_DAYS * 24 * 60 * 60 * 1_000);

    const [source, derived] = await Promise.all([
      this.container.activityReplay.dailyCounts(from, to),
      this.container.projector.dailyCounts(from, to),
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
        day: row.day,
        expected: row.source,
        actual: row.derived,
      });
    }

    if (drift.length > 0) return;

    this.container.logger.emit("analytics.reconciliation.completed", {
      days: source.length,
      durationMs: this.container.clock.now().getTime() - now.getTime(),
    });
  }
}

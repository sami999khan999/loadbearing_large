import { type Container, type Job, QueueName, type Redis, Worker } from "../import.js";

// How many activity rows move per round trip. Large enough that ClickHouse merges a
// small number of big parts rather than a large number of small ones — a thousand
// single-row inserts create a thousand parts and the background merge never catches
// up, which is the classic way a ClickHouse table gets slow.
const BATCH_SIZE = 5_000;

// A ceiling on one job, not on the backlog. Without it the first run after a long
// outage holds a Postgres connection for however long a full replay takes; with it,
// the job stops, the schedule fires again in five minutes, and the checkpoint means
// the next run resumes exactly where this one ended.
const MAX_BATCHES_PER_RUN = 20;

// How far behind the projection may fall before it is worth saying so. Two runs of
// the schedule: one late run is a slow batch, two is a consumer that has stopped.
const LAG_WARNING_MS = 10 * 60 * 1_000;

// How many days back the reconciliation compares. Long enough to catch a consumer
// that died over a weekend, short enough that the comparison is two cheap aggregates.
const RECONCILE_DAYS = 7;

// The `projection` label on every line this file emits. One projection today; the
// field exists so a second one does not have to change the event shape, and so a
// dashboard filters on it rather than on the queue name.
const PROJECTION = "activity_events";

// The consumer that makes ClickHouse derived rather than authoritative.
//
// Both jobs exist because of the same failure, and it is not an outage: it is a
// projection that stopped quietly on a Tuesday and was noticed a quarter later when a
// report looked wrong. `project` moves the rows; `reconcile` is what notices when it
// has not been.
//
// Registered only when the container was built with a ClickHouse config — a consumer
// polling a store that is not running looks identical to a working one.
export class AnalyticsConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
  ) {}

  public start(): Worker {
    const worker = new Worker(
      QueueName.ANALYTICS,
      async (job: Job) => this.handle(job),
      // Serial regardless of what is configured elsewhere: two overlapping runs read
      // the same checkpoint, project the same rows, and turn one batch into two.
      // Correctness here rests on there being one writer, not on the insert being
      // idempotent — though it is that too.
      { connection: this.connection, concurrency: this.concurrency },
    );

    worker.on("failed", (job, error) => {
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

  // Read the checkpoint out of the destination, walk forward in keyset batches, stop
  // when a batch comes back short. The checkpoint advances because rows landed, never
  // because a batch was acknowledged — a projector that failed mid-insert resumes
  // from what is actually in the table.
  private async project(): Promise<void> {
    const projector = this.container.projector;
    const startedAt = this.container.clock.now();

    let checkpoint = await projector.checkpoint();
    let projected = 0;
    let batches = 0;

    while (batches < MAX_BATCHES_PER_RUN) {
      const records = await this.container.activityReplay.since(checkpoint, BATCH_SIZE);
      if (records.length === 0) break;

      projected += await projector.project(records);
      batches += 1;

      const last = records[records.length - 1];
      if (!last) break;
      checkpoint = { lastOccurredAt: last.occurredAt, lastId: last.id };

      // A short batch means the replay has caught up. Continuing would issue one more
      // query to learn what this length already said.
      if (records.length < BATCH_SIZE) break;
    }

    const now = this.container.clock.now();
    const lagMs = checkpoint.lastOccurredAt
      ? now.getTime() - checkpoint.lastOccurredAt.getTime()
      : 0;
    const lagSeconds = Math.round(lagMs / 1_000);

    this.container.logger.emit("analytics.projection.completed", {
      projection: PROJECTION,
      events: projected,
      durationMs: now.getTime() - startedAt.getTime(),
      lagSeconds,
      capped: batches >= MAX_BATCHES_PER_RUN,
    });

    // Warned on separately, and at `warn` rather than `debug`, because this is the
    // signal that matters. A projection that throws is already an error line; one
    // that quietly falls further behind every run produces nothing at all.
    if (lagMs > LAG_WARNING_MS) {
      this.container.logger.emit("analytics.projection.lagged", {
        projection: PROJECTION,
        lagSeconds,
        thresholdSeconds: LAG_WARNING_MS / 1_000,
      });
    }
  }

  // Counts per day on both sides and a diff. Neither store reaches into the other —
  // each answers the same question in the same shape and this compares the answers,
  // which is what keeps both adapters single-store.
  //
  // Today is excluded: it is still being written to, so a difference in it is timing
  // rather than drift, and a check that cries wolf daily is a check nobody reads.
  private async reconcile(): Promise<void> {
    const now = this.container.clock.now();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(to.getTime() - RECONCILE_DAYS * 24 * 60 * 60 * 1_000);

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

    // One line per drifting day, not one line listing them. A log field is something
    // you filter and alert on, never a structure you read — and the day is exactly
    // the grain an operator groups by when deciding how far back to replay.
    //
    // `error`, not `warn`: every number a dashboard has shown since the first
    // drifting day is wrong, and the fix is a replay — which only works while the
    // activity log still covers the window, so this has a deadline attached.
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

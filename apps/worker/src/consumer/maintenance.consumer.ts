import { type Container, type Job, QueueName, type Redis, Worker } from "../import.js";

// The consumer whose absence meant `cleanup-daily` registered every boot and never ran,
// accumulating silently. See docs/reference/consumers.md.
export class MaintenanceConsumer {
  // Three, not one: a table with no partition for today rejects every insert, so one
  // month of runway makes a missed run an outage. See docs/reference/consumers.md.
  private static readonly MONTHS_AHEAD = 3;

  // Thirteen months keeps a full year queryable in Postgres and archives the month that
  // has just fallen out of it.
  private static readonly RETAIN_MONTHS = 13;

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
      case "archive":
        return this.archive();
      default:
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  }

  private async cleanup(): Promise<void> {
    const outcome = await this.container.maintenance.sweepExpired(this.container.clock.now());

    this.container.logger.emit("maintenance.sweep.completed", {
      sessions: outcome.sessions,
      verifications: outcome.verifications,
    });
  }

  // From the clock rather than the job payload, so a redelivered job archives the same
  // month rather than one relative to the retry.
  private async archive(): Promise<void> {
    const now = this.container.clock.now();
    const period = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MaintenanceConsumer.RETAIN_MONTHS, 1),
    );

    const archived = await this.container.activityArchive.archive(period);

    this.container.logger.emit("maintenance.partition.archived", {
      period: archived.period,
      key: archived.key,
      rowCount: archived.rowCount,
    });
  }

  private async partitions(): Promise<void> {
    const created = await this.container.maintenance.ensureActivityPartitions(
      this.container.clock.now(),
      MaintenanceConsumer.MONTHS_AHEAD,
    );

    this.container.logger.emit("maintenance.partitions.ensured", {
      table: "activity_log",
      created: created.length,
      monthsAhead: MaintenanceConsumer.MONTHS_AHEAD,
    });
  }
}

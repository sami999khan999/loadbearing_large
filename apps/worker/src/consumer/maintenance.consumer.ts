import {
  type Container,
  type Job,
  PartitionedTable,
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
      invitations: outcome.invitations,
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

  // Every partitioned table, from the allowlist rather than named here: a table added in
  // a later migration is covered by this schedule with no edit to the worker.
  private async partitions(): Promise<void> {
    for (const table of PartitionedTable.ALL) {
      const created = await this.container.maintenance.ensureMonthlyPartitions(
        table,
        this.container.clock.now(),
        MaintenanceConsumer.MONTHS_PER_RUN,
      );

      // One line per table, and `table` is a field rather than part of the code: the
      // event catalog is the cardinality budget for the `event_code` label.
      this.container.logger.emit("maintenance.partitions.ensured", {
        table,
        created: created.length,
        months: MaintenanceConsumer.MONTHS_PER_RUN,
      });
    }
  }
}

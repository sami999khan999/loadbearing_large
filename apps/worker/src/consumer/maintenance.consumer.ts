import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { type Job, Worker } from "bullmq";
import type { Redis } from "ioredis";

// How many months of `activity_log` partitions to keep ahead of today. Three, not one:
// a partitioned table with no partition for the current date rejects every insert, so
// running exactly one month ahead makes a single missed run a total write outage at
// midnight on the first. At three, the job can fail twice before anything breaks.
const MONTHS_AHEAD = 3;

// How far back the archive job reaches. Thirteen months keeps a full year queryable in
// Postgres and archives the month that has just fallen out of it.
const RETAIN_MONTHS = 13;

// The consumer whose absence meant `cleanup-daily` registered every boot and never ran.
// `CleanupSchedule` publishes onto MAINTENANCE and nothing was listening, so the jobs
// accumulated silently — a schedule with no consumer looks identical to a working one
// from the outside, which is the whole reason this file exists before the rest.
export class MaintenanceConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
  ) {}

  public start(): Worker {
    const worker = new Worker(
      QueueName.MAINTENANCE,
      async (job: Job) => this.handle(job),
      // Deliberately serial by default. These jobs take table-level locks and run
      // nightly; two of them overlapping buys nothing and can deadlock on the same
      // partition.
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

  // One queue, several jobs, dispatched on the job name the schedule published under.
  // An unknown name throws rather than succeeding quietly: a schedule renamed on one
  // side and not the other should be loud.
  //
  // Public, like every other consumer's, because this — not `start()` — is the
  // consumer's unit of work. `start()` is the BullMQ binding around it, and it needs a
  // live Redis, so a private handler is a handler no test can reach.
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

  // The month that has just aged out. Computed from the clock rather than passed in
  // the job payload, so a redelivered job archives the same month rather than one
  // relative to whenever the retry happened.
  private async archive(): Promise<void> {
    const now = this.container.clock.now();
    const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RETAIN_MONTHS, 1));

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
      MONTHS_AHEAD,
    );

    this.container.logger.emit("maintenance.partitions.ensured", {
      table: "activity_log",
      created: created.length,
      monthsAhead: MONTHS_AHEAD,
    });
  }
}

import { type Container, Queue, QueueName, type Redis } from "../import.js";

// Detach, ship to S3, record in `activity_archive` — the table that makes a replay past
// the Postgres window automatable. See docs/reference/schedules.md.
export class ArchiveSchedule {
  private static readonly JOB_ID = "archive-monthly";
  // 04:00 on the first, after the runway is extended and the sweep has run, so the three
  // never contend for the same locks.
  private static readonly PATTERN = "0 4 1 * *";

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public async register(): Promise<void> {
    const queue = new Queue(QueueName.MAINTENANCE, { connection: this.connection });

    try {
      await queue.add(
        "archive",
        {},
        {
          repeat: { pattern: ArchiveSchedule.PATTERN },
          jobId: ArchiveSchedule.JOB_ID,
          removeOnComplete: 10,
          removeOnFail: 100,
          // One attempt: a retry re-runs `detach` on an already-detached partition and
          // fails on that instead of on whatever actually broke.
          attempts: 1,
        },
      );

      this.container.logger.emit("queue.schedule.registered", {
        queue: QueueName.MAINTENANCE,
        jobId: ArchiveSchedule.JOB_ID,
      });
    } finally {
      await queue.close();
    }
  }
}

import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

// Detaches the month that has just aged out of the retention window, ships it to S3 as
// gzipped NDJSON, and records it in `activity_archive`. That table is what makes a
// ClickHouse replay past the Postgres window automatable rather than archaeology, and
// nothing wrote to it before this schedule existed.
export class ArchiveSchedule {
  private static readonly JOB_ID = "archive-monthly";
  // 04:00 on the first — after `partitions-monthly` at 02:00 has extended the runway
  // and after `cleanup-daily` at 03:00, so the three never contend for the same locks.
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
          // One attempt. A retry would re-run `detach` on a partition that is already
          // detached and fail on that instead of on whatever actually broke, which
          // buries the real error. Re-run it by hand once the cause is known.
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

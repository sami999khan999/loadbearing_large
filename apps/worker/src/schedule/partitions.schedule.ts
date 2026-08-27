import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

// Creates the next few months of `activity_log` partitions. The deadline is real:
// migration 0000 created partitions through 2027-01, and the day after the last one
// ends, every insert to `activity_log` fails — which under the analytics design is
// also every analytics write.
export class PartitionsSchedule {
  private static readonly JOB_ID = "partitions-monthly";
  // 02:00 on the first. Ahead of the 03:00 cleanup, because a sweep that runs while
  // the current month has no partition fails on a table it cannot write to.
  private static readonly PATTERN = "0 2 1 * *";

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public async register(): Promise<void> {
    const queue = new Queue(QueueName.MAINTENANCE, { connection: this.connection });

    try {
      await queue.add(
        "partitions",
        {},
        {
          repeat: { pattern: PartitionsSchedule.PATTERN },
          jobId: PartitionsSchedule.JOB_ID,
          removeOnComplete: 10,
          removeOnFail: 100,
        },
      );

      this.container.logger.emit("queue.schedule.registered", {
        queue: QueueName.MAINTENANCE,
        jobId: PartitionsSchedule.JOB_ID,
      });
    } finally {
      await queue.close();
    }
  }
}

import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export class CleanupSchedule {
  // Fixed, which is what makes registration idempotent. Without it every deploy adds
  // another copy and the nightly job runs eleven times by Friday.
  private static readonly JOB_ID = "cleanup-daily";
  private static readonly PATTERN = "0 3 * * *";

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public async register(): Promise<void> {
    const queue = new Queue(QueueName.MAINTENANCE, { connection: this.connection });

    try {
      await queue.add(
        "cleanup",
        {},
        {
          repeat: { pattern: CleanupSchedule.PATTERN },
          jobId: CleanupSchedule.JOB_ID,
          removeOnComplete: 10,
          removeOnFail: 100,
        },
      );

      this.container.logger.emit("queue.schedule.registered", {
        queue: QueueName.MAINTENANCE,
        jobId: CleanupSchedule.JOB_ID,
      });
    } finally {
      // The `Queue` exists only to publish the repeatable entry. Left open it holds a
      // second connection to the queue instance for the life of the process.
      await queue.close();
    }
  }
}

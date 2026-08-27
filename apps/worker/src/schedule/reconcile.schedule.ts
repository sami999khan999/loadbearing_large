import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

// The daily count check between the audit trail and the derived store. It is the
// second of the two guards that keep ClickHouse derived, and the one that catches the
// realistic failure: not an outage, but a projection that stopped quietly and was
// noticed a quarter later when a report looked wrong.
//
// 05:00, after `archive-monthly` at 04:00 on the first — so on that one morning of the
// month the reconciliation reads a window the archive job has already finished with.
export class ReconcileSchedule {
  private static readonly JOB_ID = "analytics-reconcile";
  private static readonly PATTERN = "0 5 * * *";

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public async register(): Promise<void> {
    const queue = new Queue(QueueName.ANALYTICS, { connection: this.connection });

    try {
      await queue.add(
        "reconcile",
        {},
        {
          repeat: { pattern: ReconcileSchedule.PATTERN },
          jobId: ReconcileSchedule.JOB_ID,
          removeOnComplete: 10,
          removeOnFail: 100,
          attempts: 1,
        },
      );

      this.container.logger.emit("queue.schedule.registered", {
        queue: QueueName.ANALYTICS,
        jobId: ReconcileSchedule.JOB_ID,
      });
    } finally {
      await queue.close();
    }
  }
}

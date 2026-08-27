import type { Container } from "@loadbearing/composition";
import { QueueName } from "@loadbearing/infrastructure";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

// Every five minutes, not every second. The analytics queue is the one that is allowed
// to fall behind — nobody waits on a dashboard row — and a five-minute cadence keeps
// each run a handful of large inserts rather than a stream of small parts ClickHouse
// then has to merge.
//
// Registered only when the container holds an `AnalyticsProjector`. A schedule with no
// consumer is what left `cleanup-daily` silently accumulating, and a schedule with a
// consumer but no store is worse: it looks like it is working.
export class ProjectionSchedule {
  private static readonly JOB_ID = "analytics-projection";
  private static readonly PATTERN = "*/5 * * * *";

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public async register(): Promise<void> {
    const queue = new Queue(QueueName.ANALYTICS, { connection: this.connection });

    try {
      await queue.add(
        "project",
        {},
        {
          repeat: { pattern: ProjectionSchedule.PATTERN },
          jobId: ProjectionSchedule.JOB_ID,
          removeOnComplete: 20,
          removeOnFail: 100,
          // One attempt, because the schedule is the retry. A failed run leaves the
          // checkpoint where it was, and the next tick five minutes later resumes from
          // exactly the same place — a retry inside the job buys nothing and stacks a
          // second run on top of one that may still be holding a connection.
          attempts: 1,
        },
      );

      this.container.logger.emit("queue.schedule.registered", {
        queue: QueueName.ANALYTICS,
        jobId: ProjectionSchedule.JOB_ID,
      });
    } finally {
      await queue.close();
    }
  }
}

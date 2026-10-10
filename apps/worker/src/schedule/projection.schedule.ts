import { type Container, Queue, QueueName, type Redis } from "../import.js";
import { UtcCron } from "./utc-cron.js";

// Every five minutes: the analytics queue is the one allowed to fall behind. Registered
// only with an `AnalyticsProjector` — see docs/reference/schedules.md.
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
      await UtcCron.dropLocal(
        queue,
        "project",
        ProjectionSchedule.PATTERN,
        ProjectionSchedule.JOB_ID,
      );
      await queue.add(
        "project",
        {},
        {
          repeat: { pattern: ProjectionSchedule.PATTERN, tz: UtcCron.TZ },
          jobId: ProjectionSchedule.JOB_ID,
          removeOnComplete: 20,
          removeOnFail: 100,
          // One attempt, because the schedule is the retry: a failed run leaves the
          // checkpoint where it was and the next tick resumes there.
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

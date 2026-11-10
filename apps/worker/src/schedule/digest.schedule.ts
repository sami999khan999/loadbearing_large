import { type Container, Queue, QueueName, type Redis } from "../import.js";
import { UtcCron } from "./utc-cron.js";

export class DigestSchedule {
  private static readonly JOB_ID = "digest-hourly";

  // On the hour, every hour: each run sends only the tenants whose digest hour it is
  // (`26.7`), and a tenant that never chose one is due at 07:00 UTC as before.
  private static readonly PATTERN = "0 * * * *";

  // The single daily run every deploy before `26.7` registered. Left behind, it would
  // send every tenant's digest at 07:00 on top of the hourly runs.
  private static readonly RETIRED = { jobId: "digest-daily", pattern: "0 7 * * *" } as const;

  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
  ) {}

  public async register(): Promise<void> {
    const queue = new Queue(QueueName.NOTIFICATION, { connection: this.connection });

    try {
      await UtcCron.dropLocal(
        queue,
        "digest-fanout",
        DigestSchedule.PATTERN,
        DigestSchedule.JOB_ID,
      );
      await queue.removeRepeatable(
        "digest-fanout",
        { pattern: DigestSchedule.RETIRED.pattern, tz: UtcCron.TZ },
        DigestSchedule.RETIRED.jobId,
      );
      await queue.add(
        "digest-fanout",
        {},
        {
          repeat: { pattern: DigestSchedule.PATTERN, tz: UtcCron.TZ },
          jobId: DigestSchedule.JOB_ID,
          // One failed fan-out would otherwise be that hour's tenants' digests, gone.
          attempts: 5,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: 10,
          removeOnFail: 100,
        },
      );

      this.container.logger.emit("queue.schedule.registered", {
        queue: QueueName.NOTIFICATION,
        jobId: DigestSchedule.JOB_ID,
      });
    } finally {
      await queue.close();
    }
  }
}

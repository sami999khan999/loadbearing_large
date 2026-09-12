import { SystemPrincipal } from "../bootstrap/index.js";
import {
  type Container,
  type Job,
  type OrganizationId,
  QueueName,
  type Redis,
  Worker,
} from "../import.js";

interface DigestJobData {
  readonly organizationId: string;
  readonly day: string;
}

// One page of tenants per fan-out. A deployment with more than this many digesting
// organizations wants the fan-out itself paged, and that is a `[!]` worth seeing.
const MAX_ORGANIZATIONS = 5_000;

export class NotificationConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
  ) {}

  public start(): Worker {
    const worker = new Worker(QueueName.NOTIFICATION, async (job: Job) => this.handle(job), {
      connection: this.connection,
      concurrency: this.concurrency,
    });

    worker.on("failed", (job, error) => {
      this.container.logger.emit("queue.job.failed", {
        queue: QueueName.NOTIFICATION,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });

      this.container.logger.failure(error, {
        queue: QueueName.NOTIFICATION,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });
    });

    worker.on("stalled", (jobId) => {
      this.container.logger.emit("queue.job.stalled", { queue: QueueName.NOTIFICATION, jobId });
    });

    return worker;
  }

  public async handle(job: Job): Promise<void> {
    switch (job.name) {
      case "digest-fanout":
        return this.fanOut();
      case "digest":
        return this.digest(job.data as DigestJobData);
      default:
        throw new Error(`Unknown notification job: ${job.name}`);
    }
  }

  // One job per tenant rather than one job doing every tenant: a digest that fails for
  // one organization must not stop the other four thousand.
  private async fanOut(): Promise<void> {
    const day = NotificationConsumer.dayOf(this.container.clock.now());
    const organizations = await this.container.notification.digestOrganizations.execute(
      SystemPrincipal.platform(),
    );

    for (const organizationId of organizations.slice(0, MAX_ORGANIZATIONS)) {
      await this.container.queue.publish(
        QueueName.NOTIFICATION,
        { organizationId, day },
        {
          name: "digest",
          // Tenant plus day. A schedule that fires twice, or a redelivered fan-out,
          // produces the same id and BullMQ sends one morning's digest.
          jobId: `digest_${organizationId}_${day}`,
          attempts: 3,
        },
      );
    }

    this.container.logger.emit("notification.digest.completed", {
      organizations: organizations.length,
      day,
    });
  }

  private async digest(data: DigestJobData): Promise<void> {
    await this.container.notification.sendDigest.execute(SystemPrincipal.platform(), {
      organizationId: data.organizationId as OrganizationId,
      day: data.day,
    });
  }

  // UTC, and from the clock rather than the payload for the fan-out: a redelivered job
  // covers the same day rather than one relative to the retry.
  private static dayOf(now: Date): string {
    return now.toISOString().slice(0, 10);
  }
}

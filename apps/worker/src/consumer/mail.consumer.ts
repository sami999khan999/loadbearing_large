import { SystemPrincipal, withShard } from "../bootstrap/index.js";
import {
  type Container,
  type Job,
  type OrganizationId,
  QueueName,
  type Redis,
  type UserId,
  Worker,
} from "../import.js";

interface MailJobData {
  readonly template: string;
  readonly to: string;
  readonly locale: string;
  readonly params: unknown;
  // Absent on a job queued before the delivery log, which is recorded as the platform's.
  readonly organizationId?: string | null;
  readonly userId?: string | null;
}

// A thin adapter, exactly like an oRPC router. Everything worth testing lives in
// `SendMailUseCase`. See docs/reference/consumers.md.
export class MailConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
    private readonly ratePerMinute: number,
  ) {}

  public start(): Worker {
    const worker = new Worker<MailJobData>(
      QueueName.MAIL,
      async (job: Job<MailJobData>) => this.handle(job),
      {
        connection: this.connection,
        concurrency: this.concurrency,
        // A provider's rate limit is a property of this queue and of nothing else. One
        // limiter here is what keeps it out of every caller as a sleep.
        limiter: { max: this.ratePerMinute, duration: 60_000 },
      },
    );

    worker.on("failed", (job, error) => {
      this.container.logger.emit("queue.job.failed", {
        queue: QueueName.MAIL,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });

      this.container.logger.failure(error, {
        queue: QueueName.MAIL,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });

      // The only place a permanently undelivered message is reported: this line, and its
      // row in the delivery log.
      if (job && MailConsumer.isFinalAttempt(job)) {
        this.container.logger.emit("mail.delivery.failed", {
          template: job.data.template,
          attempts: job.attemptsMade,
        });
        void this.record(job, "failed", null, job.attemptsMade);
      }
    });

    worker.on("completed", (job) => {
      this.container.logger.emit("queue.job.completed", {
        queue: QueueName.MAIL,
        jobId: job.id ?? "unknown",
        durationMs: Math.max(0, (job.finishedOn ?? 0) - (job.processedOn ?? 0)),
      });
    });

    worker.on("stalled", (jobId) => {
      this.container.logger.emit("queue.job.stalled", { queue: QueueName.MAIL, jobId });
    });

    return worker;
  }

  // An unknown job name throws rather than succeeding quietly. Public, because this and
  // not `start()` is the unit of work.
  public async handle(job: Job<MailJobData>): Promise<void> {
    switch (job.name) {
      case "send":
        // Let it throw: BullMQ's retry is driven by rejection, so catching here turns a
        // provider outage into permanent, silent loss.
        {
          const receipt = await this.container.mail.send.execute(SystemPrincipal.platform(), {
            template: job.data.template,
            to: job.data.to,
            locale: job.data.locale as never,
            params: job.data.params,
            organizationId: (job.data.organizationId ?? null) as OrganizationId | null,
          });

          // The id a provider webhook would later correlate against, which is the whole
          // reason the port returns one. Empty when the server gave none.
          this.container.logger.emit("mail.delivery.sent", {
            template: job.data.template,
            messageId: receipt.messageId ?? "",
          });
          await this.record(job, "sent", receipt.messageId ?? null, job.attemptsMade + 1);
        }
        return;
      default:
        throw new Error(`Unknown mail job: ${job.name}`);
    }
  }

  // After the outcome, never before, and never fatal (`26.10`): a row that cannot be written
  // is a line in the log, not a resend of mail that already went.
  private async record(
    job: Job<MailJobData>,
    status: "sent" | "failed",
    messageId: string | null,
    attempts: number,
  ): Promise<void> {
    try {
      const record = this.container.mail.record;
      const organizationId = (job.data.organizationId ?? null) as OrganizationId | null;
      const tenant = await record.tenantOf(organizationId);
      await withShard(this.container, tenant, () =>
        record.execute({
          organizationId: tenant,
          userId: (job.data.userId ?? null) as UserId | null,
          template: job.data.template,
          to: job.data.to,
          status,
          messageId,
          attempts,
        }),
      );
    } catch (error: unknown) {
      this.container.logger.failure(error, {
        at: "mail.delivery.record",
        template: job.data.template,
      });
    }
  }

  // `attemptsMade` counts the one that just failed, so equality is the last one.
  private static isFinalAttempt(job: Job<MailJobData> | undefined): boolean {
    if (!job) return false;
    return job.attemptsMade >= (job.opts.attempts ?? 1);
  }
}

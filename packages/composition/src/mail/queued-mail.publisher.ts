import {
  type Logger,
  MailPublisher,
  type MailRequest,
  QueueName,
  type QueuePublisher,
} from "../import.js";

// BullMQ orders by ascending priority. Two values, because the only distinction that has
// ever mattered is whether somebody is sitting in front of a screen waiting for it.
const PRIORITY = Object.freeze({ high: 1, normal: 5 });

// Five for the mail a sign-up cannot complete without, three for everything else: the
// extra attempts buy roughly a minute more of a provider being down.
const ATTEMPTS = Object.freeze({ high: 5, normal: 3 });

// The whole publisher. There is no row, no status and no sweep — see
// docs/reference/mail-pipeline.md.
export class QueuedMailPublisher extends MailPublisher {
  public constructor(
    private readonly queue: QueuePublisher,
    // Optional for the same reason `SmtpEmailSender`'s is: a spec asserting on job options
    // should not have to build a logger to do it.
    private readonly logger?: Logger,
  ) {
    super();
  }

  // It does not catch. With no durable record behind the enqueue there is nothing for a
  // swallowed failure to be secondary to, and a caller that cannot queue mail should learn.
  public override async publish(mail: MailRequest): Promise<void> {
    const priority = mail.priority ?? "normal";

    await this.queue.publish(QueueName.MAIL, mail, {
      name: "send",
      // The caller's "send this once", expressed where BullMQ already enforces it.
      ...(mail.dedupeKey === undefined ? {} : { jobId: mail.dedupeKey }),
      priority: PRIORITY[priority],
      attempts: ATTEMPTS[priority],
    });

    // No recipient on the line. An address is the highest-cardinality field this system
    // holds, and a log platform is not where it belongs.
    this.logger?.emit("mail.delivery.queued", { template: mail.template, priority });
  }
}

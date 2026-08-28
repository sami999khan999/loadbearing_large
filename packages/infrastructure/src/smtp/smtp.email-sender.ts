import {
  createTransport,
  type EmailMessage,
  EmailSender,
  type Transporter,
  UnavailableError,
} from "../import.js";

export interface SmtpConfig {
  // A URL rather than five fields: `smtp://user:pass@host:587`, or `smtps://` for
  // implicit TLS on 465. One environment variable, and the same string works against
  // Mailpit locally and against SES, Postmark or Resend's SMTP endpoint in production.
  readonly url: string;
  // The envelope sender. Not optional and not defaulted: an address the domain does not
  // authorise is a message that either bounces or lands in spam, and a wrong default
  // fails that way silently on the first real deploy.
  readonly from: string;
}

// SMTP, not a provider's HTTP API, and that is the portability choice. Every managed
// sender speaks it, so swapping vendors is a URL — where an HTTP adapter would be a new
// class per vendor. When one is wanted for its analytics, it is a second file in this
// folder and one line in `Container`.
export class SmtpEmailSender extends EmailSender {
  // Built once and reused. Nodemailer pools nothing by default, but the transport still
  // holds the resolved auth and TLS settings, and rebuilding it per message re-does that
  // work on every send.
  private readonly transport: Transporter;

  public constructor(private readonly config: SmtpConfig) {
    super();
    this.transport = createTransport(config.url);
  }

  public override async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
    } catch {
      // UNAVAILABLE, not INTERNAL: the catalog marks it retryable, and a refused SMTP
      // connection is almost always a transient one. The same reasoning as
      // `OpenAiEmbeddingProvider` — the distinction is what lets a queued send be
      // retried rather than dead-lettered.
      throw new UnavailableError("smtp");
    }
  }
}

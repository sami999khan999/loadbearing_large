import {
  createTransport,
  type EmailMessage,
  EmailSender,
  type Transporter,
  UnavailableError,
} from "../import.js";

export interface SmtpConfig {
  // A URL rather than five fields, so one environment variable works against Mailpit
  // locally and a managed sender in production.
  readonly url: string;
  // Not optional and not defaulted: an address the domain does not authorise bounces or
  // lands in spam, silently, on the first real deploy.
  readonly from: string;
}

// SMTP, not a provider's HTTP API: every managed sender speaks it, so swapping vendors is
// a URL rather than a new class.
export class SmtpEmailSender extends EmailSender {
  // Built once and reused: the transport holds the resolved auth and TLS settings, and
  // rebuilding it per message re-does that work on every send.
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
      // UNAVAILABLE, not INTERNAL: the catalog marks it retryable, which is what lets a
      // queued send be retried rather than dead-lettered.
      throw new UnavailableError("smtp");
    }
  }
}

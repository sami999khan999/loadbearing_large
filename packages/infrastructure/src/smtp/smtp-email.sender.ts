import {
  createTransport,
  type EmailMessage,
  EmailSender,
  type Logger,
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

  public constructor(
    private readonly config: SmtpConfig,
    private readonly logger?: Logger,
  ) {
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
    } catch (error: unknown) {
      // The transport's reason, which the error below cannot carry: a caller that treats
      // a failed send as recoverable would otherwise leave nothing to diagnose from.
      this.logger?.emit("email.send.failed", { reason: SmtpEmailSender.reason(error) });

      // UNAVAILABLE, not INTERNAL: the catalog marks it retryable, which is what lets a
      // queued send be retried rather than dead-lettered.
      throw new UnavailableError("smtp");
    }
  }

  // Nodemailer keeps sockets open between sends, and a process that exits without closing
  // them waits on the SMTP server to time each one out. Not `async`: `close()` is sync.
  public close(): Promise<void> {
    this.transport.close();
    return Promise.resolve();
  }

  // Truncated, because a rejected recipient list comes back as the whole message.
  private static reason(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 300);
  }
}

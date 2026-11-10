import {
  type Locale,
  MailTemplates,
  type OrganizationId,
  type SchemaIssue,
  ValidationError,
} from "../import.js";
import type {
  EmailReceipt,
  EmailSender,
  EmailSenderResolver,
  MailRenderer,
} from "../port/index.js";
import type { Principal } from "../primitive/index.js";

// The job's payload as it comes back off the queue: a template key that is still a
// string, and params that are still unknown. Narrowing both is this use-case's job.
export interface SendMailInput {
  readonly template: string;
  readonly to: string;
  readonly locale: Locale;
  readonly params: unknown;
  // The tenant the message is for, which picks its mail server. Absent is the platform's.
  readonly organizationId?: OrganizationId | null;
}

// Validate, render, send. No repository, no status column and no idempotency of its own:
// the job id carries that, and a throw is the queue's retry signal.
export class SendMailUseCase {
  public constructor(
    private readonly renderer: MailRenderer,
    // The deployment's sender, from `.env`: what every message falls back to.
    private readonly email: EmailSender,
    // Absent in a process that configures no mail server from the dashboard.
    private readonly senders: EmailSenderResolver | null = null,
  ) {}

  // `actor` asserts nothing, and the receipt goes back to the consumer, which logs it and
  // records the outcome. Both are argued in docs/reference/ports.md.
  public execute(actor: Principal, input: SendMailInput): Promise<EmailReceipt> {
    void actor;
    return this.send(input);
  }

  private async send(input: SendMailInput): Promise<EmailReceipt> {
    // Both failures happen before the transport is touched, because a message that
    // cannot be rendered will not render on the retry either.
    if (!MailTemplates.isKnown(input.template)) {
      throw new ValidationError([{ field: "template", rule: "unknown" }]);
    }

    const parsed = MailTemplates.schema(input.template).safeParse(input.params);
    if (!parsed.success) throw ValidationError.fromIssues(SendMailUseCase.issues(parsed.error));

    const rendered = await this.renderer.render(input.template, input.locale, parsed.data);

    const sender = await this.senderFor(input);
    return sender.send({
      to: input.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  }

  // Tenant, then platform default, then `.env`. Sign-in mail skips the tenant's server
  // (`26.11`): a tenant's misconfigured host must never lock anyone out.
  private async senderFor(input: SendMailInput): Promise<EmailSender> {
    if (!this.senders) return this.email;
    const tenant = input.template.startsWith("auth.") ? null : (input.organizationId ?? null);
    if (tenant !== null) {
      const own = await this.senders.senderFor(tenant);
      if (own) return own;
    }
    return (await this.senders.senderFor(null)) ?? this.email;
  }

  // Zod paths may hold a symbol and `SchemaIssue` may not, because `errors` declares that
  // shape structurally to stay dependency-free. A symbol segment names no form field.
  private static issues(error: { issues: readonly ZodIssueLike[] }): readonly SchemaIssue[] {
    return error.issues.map((issue) => ({
      ...issue,
      path: issue.path.filter((part): part is string | number => typeof part !== "symbol"),
    }));
  }
}

interface ZodIssueLike {
  readonly path: readonly PropertyKey[];
  readonly code: string;
  readonly minimum?: number | bigint;
  readonly maximum?: number | bigint;
}

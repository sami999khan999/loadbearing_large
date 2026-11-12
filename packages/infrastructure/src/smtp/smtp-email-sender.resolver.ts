import {
  type EmailSender,
  EmailSenderResolver,
  type Logger,
  type MailSettingsRecord,
  type MailSettingsRepository,
  type OrganizationId,
  type PlatformReader,
  type SecretCipher,
} from "../import.js";
import { SmtpEmailSender } from "./smtp-email.sender.js";

interface Cached {
  readonly checkedAt: number;
  readonly version: number | null;
  readonly sender: SmtpEmailSender | null;
}

// One pooled sender per configured server (`26.11`), rebuilt only when its row changes.
// A row is re-read at most once a minute, so a save reaches every worker within that.
export class SmtpEmailSenderResolver extends EmailSenderResolver {
  private static readonly RECHECK_MS = 60_000;
  private readonly cache = new Map<string, Cached>();

  public constructor(
    private readonly settings: MailSettingsRepository,
    private readonly cipher: SecretCipher | null,
    private readonly platform: PlatformReader,
    private readonly logger?: Logger,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  public override async senderFor(
    organizationId: OrganizationId | null,
  ): Promise<EmailSender | null> {
    const key = organizationId ?? (await this.platform.organizationId());
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.checkedAt < SmtpEmailSenderResolver.RECHECK_MS) {
      return cached.sender;
    }

    const row = await this.settings.findByOrganization(key);
    const version = row?.updatedAt.getTime() ?? null;
    if (cached && cached.version === version) {
      this.cache.set(key, { ...cached, checkedAt: this.now() });
      return cached.sender;
    }

    await cached?.sender?.close();
    const sender = row ? this.build(row) : null;
    this.cache.set(key, { checkedAt: this.now(), version, sender });
    return sender;
  }

  public async close(): Promise<void> {
    await Promise.all(
      [...this.cache.values()].map((entry) => entry.sender?.close() ?? Promise.resolve()),
    );
    this.cache.clear();
  }

  // A password that will not decrypt — a rotated key — falls back to the next sender
  // rather than failing every message for that tenant. The line says which.
  private build(row: MailSettingsRecord): SmtpEmailSender | null {
    let password = "";
    if (row.passwordCiphertext) {
      if (!this.cipher) return this.unusable(row, "no_secret_key");
      try {
        password = this.cipher.decrypt(row.passwordCiphertext);
      } catch {
        return this.unusable(row, "undecryptable");
      }
    }
    const auth = row.username
      ? `${encodeURIComponent(row.username)}:${encodeURIComponent(password)}@`
      : "";
    const scheme = row.secure ? "smtps" : "smtp";
    return new SmtpEmailSender(
      { url: `${scheme}://${auth}${row.host}:${row.port}`, from: row.fromAddress },
      this.logger,
    );
  }

  private unusable(row: MailSettingsRecord, reason: string): null {
    this.logger?.emit("mail.settings.unusable", { organizationId: row.organizationId, reason });
    return null;
  }
}

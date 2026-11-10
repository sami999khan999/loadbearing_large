import { ConflictError, type OrganizationId } from "../import.js";
import type { PlatformReader } from "../platform/index.js";
import type { ActivityLogger, SecretCipher, UnitOfWork } from "../port/index.js";
import { type Authorizer, Principal } from "../primitive/index.js";
import type { MailSettingsRepository } from "./mail-settings.repository.js";
import { type MailSettingsView, MailSettingsViews } from "./mail-settings.view.js";

export interface SaveMailSettingsInput {
  readonly organizationId: OrganizationId;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string | null;
  // Absent keeps the stored password; null clears it. Never read back.
  readonly password?: string | null;
  readonly fromAddress: string;
}

// A platform default (the platform organization's row) or one tenant's override. Sign-in
// mail never uses an override: a tenant's bad server must not lock anyone out.
export class SaveMailSettingsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: MailSettingsRepository,
    private readonly cipher: SecretCipher | null,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: { now(): Date },
  ) {}

  public async execute(actor: Principal, input: SaveMailSettingsInput): Promise<MailSettingsView> {
    this.authorizer.assert(actor, "platform.mail.manage");

    if (typeof input.password === "string" && !this.cipher) {
      throw new ConflictError("mail.settings", "no_secret_key");
    }

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );

    return this.unitOfWork.run(async () => {
      const current = await this.settings.findByOrganization(input.organizationId);
      const passwordCiphertext =
        input.password === undefined
          ? (current?.passwordCiphertext ?? null)
          : input.password === null || !this.cipher
            ? null
            : this.cipher.encrypt(input.password);

      const record = {
        organizationId: input.organizationId,
        host: input.host.trim(),
        port: input.port,
        secure: input.secure,
        username: input.username?.trim() || null,
        passwordCiphertext,
        fromAddress: input.fromAddress.trim(),
        updatedAt: this.clock.now(),
        updatedBy: actor.userId,
      };
      await this.settings.save(record);

      // The server and sender, never the password, which an audit row must not hold.
      await this.activity.record(auditor, "platform.mail.settings.saved", {
        organizationId: input.organizationId,
        host: record.host,
        fromAddress: record.fromAddress,
      });
      return MailSettingsViews.of(record);
    });
  }
}

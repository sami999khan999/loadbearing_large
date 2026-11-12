import type { OrganizationId } from "../import.js";
import type { SecretCipher } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { MailSettingsRepository } from "./mail-settings.repository.js";
import { type MailSettingsView, MailSettingsViews } from "./mail-settings.view.js";

export interface MailSettingsState {
  // False without `MAIL_SECRET_KEY`: a password cannot be stored, so none can be saved.
  readonly canStorePasswords: boolean;
  readonly settings: MailSettingsView | null;
}

export class GetMailSettingsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: MailSettingsRepository,
    private readonly cipher: SecretCipher | null,
  ) {}

  public async execute(
    actor: Principal,
    input: { readonly organizationId: OrganizationId },
  ): Promise<MailSettingsState> {
    this.authorizer.assert(actor, "platform.mail.read");

    const row = await this.settings.findByOrganization(input.organizationId);
    return {
      canStorePasswords: this.cipher !== null,
      settings: row ? MailSettingsViews.of(row) : null,
    };
  }
}

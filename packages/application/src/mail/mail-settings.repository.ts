import type { OrganizationId, UserId } from "../import.js";

// One organization's mail server. The platform organization's row is the platform's
// default; any other is that tenant's override (`26.11`).
export interface MailSettingsRecord {
  readonly organizationId: OrganizationId;
  readonly host: string;
  readonly port: number;
  // TLS from the first byte (465) rather than STARTTLS (587).
  readonly secure: boolean;
  readonly username: string | null;
  // Encrypted under `MAIL_SECRET_KEY`, and never sent back to a client.
  readonly passwordCiphertext: string | null;
  readonly fromAddress: string;
  readonly updatedAt: Date;
  readonly updatedBy: UserId;
}

export abstract class MailSettingsRepository {
  public abstract findByOrganization(
    organizationId: OrganizationId,
  ): Promise<MailSettingsRecord | null>;

  public abstract save(settings: MailSettingsRecord): Promise<void>;

  public abstract delete(organizationId: OrganizationId): Promise<void>;
}

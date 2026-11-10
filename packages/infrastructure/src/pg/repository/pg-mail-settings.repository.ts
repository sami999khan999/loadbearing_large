import {
  eq,
  type MailSettingsRecord,
  type MailSettingsRepository,
  type OrganizationId,
  type Placement,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { mailSettings } from "../schema/index.js";

export class PgMailSettingsRepository extends BaseRepository implements MailSettingsRepository {
  // A catalog row: the worker reads it for whichever tenant a message is for.
  protected override readonly placement: Placement = "catalog";

  public async findByOrganization(
    organizationId: OrganizationId,
  ): Promise<MailSettingsRecord | null> {
    const rows = await this.db
      .select()
      .from(mailSettings)
      .where(eq(mailSettings.organizationId, organizationId))
      .limit(1);
    return rows[0] ?? null;
  }

  public async save(settings: MailSettingsRecord): Promise<void> {
    const { organizationId, ...rest } = settings;
    await this.db
      .insert(mailSettings)
      .values(settings)
      .onConflictDoUpdate({ target: mailSettings.organizationId, set: rest });
  }

  public async delete(organizationId: OrganizationId): Promise<void> {
    await this.db.delete(mailSettings).where(eq(mailSettings.organizationId, organizationId));
  }
}

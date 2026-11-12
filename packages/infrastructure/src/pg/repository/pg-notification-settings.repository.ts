import {
  eq,
  type NotificationSettingsRepository,
  type OrganizationId,
  type Placement,
  type UserId,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { notificationSettings } from "../schema/index.js";

export class PgNotificationSettingsRepository
  extends BaseRepository
  implements NotificationSettingsRepository
{
  protected override readonly placement: Placement = "catalog";

  public async digestHourOf(organizationId: OrganizationId): Promise<number | null> {
    const rows = await this.db
      .select({ hour: notificationSettings.digestHour })
      .from(notificationSettings)
      .where(eq(notificationSettings.organizationId, organizationId))
      .limit(1);
    return rows[0]?.hour ?? null;
  }

  public async saveDigestHour(
    organizationId: OrganizationId,
    hour: number,
    at: Date,
    by: UserId,
  ): Promise<void> {
    await this.db
      .insert(notificationSettings)
      .values({ organizationId, digestHour: hour, updatedAt: at, updatedBy: by })
      .onConflictDoUpdate({
        target: notificationSettings.organizationId,
        set: { digestHour: hour, updatedAt: at, updatedBy: by },
      });
  }
}

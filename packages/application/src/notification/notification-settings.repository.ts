import type { OrganizationId, UserId } from "../import.js";

// A tenant's notification settings (`26.7`): today, only the hour its digest goes out.
// Catalog, because the hourly fan-out reads it for every tenant before placing any.
export abstract class NotificationSettingsRepository {
  // Null when the tenant never chose one, which is `DigestHour.DEFAULT`.
  public abstract digestHourOf(organizationId: OrganizationId): Promise<number | null>;

  public abstract saveDigestHour(
    organizationId: OrganizationId,
    hour: number,
    at: Date,
    by: UserId,
  ): Promise<void>;
}

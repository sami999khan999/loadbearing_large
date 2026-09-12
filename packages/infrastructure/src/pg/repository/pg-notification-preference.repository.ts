import {
  and,
  asc,
  eq,
  gt,
  inArray,
  type NotificationCategory,
  type NotificationPreferenceRepository,
  type OrganizationId,
  type PreferenceRecord,
  sql,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { notificationPreferences } from "../schema/index.js";

export class PgNotificationPreferenceRepository
  extends BaseRepository
  implements NotificationPreferenceRepository
{
  // One statement for N users. A delivery fanning out to a hundred recipients would
  // otherwise be a hundred round trips before it writes anything.
  public async findFor(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
    category: NotificationCategory,
  ): Promise<readonly PreferenceRecord[]> {
    if (userIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.organizationId, organizationId),
          inArray(notificationPreferences.userId, [...userIds]),
          eq(notificationPreferences.category, category),
        ),
      );

    return rows.map((row) => PgNotificationPreferenceRepository.toRecord(row));
  }

  public async listFor(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<readonly PreferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.organizationId, organizationId),
          eq(notificationPreferences.userId, userId),
        ),
      );

    return rows.map((row) => PgNotificationPreferenceRepository.toRecord(row));
  }

  // Upsert on the unique index, so setting the same preference twice is one row rather
  // than a conflict the caller has to catch.
  public async save(
    organizationId: OrganizationId,
    userId: UserId,
    preference: Omit<PreferenceRecord, "userId">,
  ): Promise<void> {
    await this.db
      .insert(notificationPreferences)
      .values({
        id: Uuid.v7(),
        organizationId,
        userId,
        category: preference.category,
        channel: preference.channel,
        mode: preference.mode,
      })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.organizationId,
          notificationPreferences.userId,
          notificationPreferences.category,
          notificationPreferences.channel,
        ],
        set: { mode: preference.mode, updatedAt: sql`now()` },
      });
  }

  // Cross-tenant by design and reachable only from the worker's digest fan-out: the
  // schedule asks "which tenants have anyone to write to at all".
  public async organizationsWithDigest(): Promise<readonly OrganizationId[]> {
    const rows = await this.db
      .selectDistinct({ organizationId: notificationPreferences.organizationId })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.mode, "digest"));

    return rows.map((row) => row.organizationId);
  }

  // Keyset on the user id, which is the only stable order a preference page has. Offset
  // here would re-read every earlier recipient for each page of a large tenant.
  public async digestRecipients(
    organizationId: OrganizationId,
    limit: number,
    afterUserId: UserId | null,
  ): Promise<readonly UserId[]> {
    const rows = await this.db
      .selectDistinct({ userId: notificationPreferences.userId })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.organizationId, organizationId),
          eq(notificationPreferences.channel, "email"),
          eq(notificationPreferences.mode, "digest"),
          afterUserId ? gt(notificationPreferences.userId, afterUserId) : undefined,
        ),
      )
      .orderBy(asc(notificationPreferences.userId))
      .limit(limit);

    return rows.map((row) => row.userId);
  }

  private static toRecord(row: typeof notificationPreferences.$inferSelect): PreferenceRecord {
    return {
      userId: row.userId,
      category: row.category as PreferenceRecord["category"],
      channel: row.channel as PreferenceRecord["channel"],
      mode: row.mode as PreferenceRecord["mode"],
    };
  }
}

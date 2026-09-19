import {
  and,
  desc,
  eq,
  gt,
  isNull,
  type NewNotification,
  type NotificationId,
  type NotificationKind,
  type NotificationPage,
  type NotificationRecord,
  type NotificationRepository,
  type OrganizationId,
  type Placement,
  sql,
  type UnreadQuery,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository, KeysetCursor } from "../primitive/index.js";
import { notifications } from "../schema/index.js";

// Postgres caps a single insert's parameter count, and a delivery to a large
// organization is the one path that can approach it.
const CHUNK = 1_000;

export class PgNotificationRepository extends BaseRepository implements NotificationRepository {
  // `notifications` is tenant-produced.
  protected override readonly placement: Placement = "routed";

  public async list(
    organizationId: OrganizationId,
    userId: UserId,
    query: UnreadQuery,
  ): Promise<NotificationPage> {
    const after = query.cursor ? KeysetCursor.decode(query.cursor) : null;

    // `limit + 1`: the extra row is how the page knows there is another one, without a
    // count over a partitioned table.
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          query.unreadOnly ? isNull(notifications.readAt) : undefined,
          // A row constructor, not `a < x OR (a = x AND b < y)`: the same predicate, and
          // only this form uses `notifications_inbox_idx` as a walk rather than a sort.
          after
            ? sql`(${notifications.createdAt}, ${notifications.id}) < (${after.at}, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return {
      items: page.map((row) => PgNotificationRepository.toRecord(row)),
      nextCursor:
        rows.length > query.limit && last ? KeysetCursor.encode(last.createdAt, last.id) : null,
    };
  }

  // Capped in SQL rather than by slicing the result: `LIMIT` inside the subquery is what
  // stops Postgres counting a hundred thousand index entries to render "99+".
  public async countUnread(
    organizationId: OrganizationId,
    userId: UserId,
    cap: number,
  ): Promise<number> {
    const result = await this.db.execute<{ count: string }>(sql`
      select count(*)::text as count from (
        select 1 from notifications
        where organization_id = ${organizationId}
          and user_id = ${userId}
          and read_at is null
        limit ${cap}
      ) capped
    `);

    return Number(result.rows[0]?.count ?? "0");
  }

  // One statement per chunk for N recipients, and `ON CONFLICT DO NOTHING` on the dedupe
  // index — which is what makes a replayed event write nothing rather than duplicate.
  public async saveMany(records: readonly NewNotification[]): Promise<readonly UserId[]> {
    const written: UserId[] = [];

    for (let index = 0; index < records.length; index += CHUNK) {
      const chunk = records.slice(index, index + CHUNK);

      const inserted = await this.db
        .insert(notifications)
        .values(
          chunk.map((record) => ({
            id: Uuid.v7(),
            organizationId: record.organizationId,
            userId: record.userId,
            eventId: record.eventId,
            kind: record.kind,
            category: record.category,
            params: { ...record.params },
            link: record.link,
            subjectId: record.subjectId,
            // From the event, not `defaultNow()`: the dedupe index carries this column,
            // so a redelivery has to compute the same value to collide with itself.
            createdAt: record.createdAt,
          })),
        )
        .onConflictDoNothing()
        .returning({ userId: notifications.userId });

      written.push(...inserted.map((row) => row.userId));
    }

    return written;
  }

  // One indexed query against `notifications_subject_idx`, and what keeps a burst of ten
  // messages to one bell item rather than ten.
  public async existsUnread(
    organizationId: OrganizationId,
    userId: UserId,
    kind: NotificationKind,
    subjectId: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          eq(notifications.kind, kind),
          eq(notifications.subjectId, subjectId),
          isNull(notifications.readAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  // `createdAt` in the predicate is the partition hint. Without it Postgres has to look
  // in every month, and a wrong value is simply no rows rather than another user's.
  public async markRead(
    organizationId: OrganizationId,
    userId: UserId,
    id: NotificationId,
    createdAt: Date,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          eq(notifications.id, id),
          eq(notifications.createdAt, createdAt),
          isNull(notifications.readAt),
        ),
      );
  }

  public async markAllRead(
    organizationId: OrganizationId,
    userId: UserId,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      );
  }

  public async listUnreadSince(
    organizationId: OrganizationId,
    userId: UserId,
    since: Date,
    limit: number,
  ): Promise<readonly NotificationRecord[]> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          gt(notifications.createdAt, since),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);

    return rows.map((row) => PgNotificationRepository.toRecord(row));
  }

  private static toRecord(row: typeof notifications.$inferSelect): NotificationRecord {
    return {
      id: row.id as NotificationId,
      kind: row.kind as NotificationRecord["kind"],
      category: row.category as NotificationRecord["category"],
      params: row.params,
      link: row.link,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}

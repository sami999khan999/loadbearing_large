import {
  and,
  type ConversationId,
  desc,
  eq,
  inArray,
  isNull,
  type MessageId,
  type MessagePageResult,
  type MessageQuery,
  type MessageRecord,
  type MessageRepository,
  type NewMessage,
  NotFoundError,
  type OrganizationId,
  sql,
  type UnreadCount,
  type UserId,
} from "../../import.js";
import { BaseRepository, KeysetCursor } from "../primitive/index.js";
import { conversationMembers, messages } from "../schema/index.js";

// Past this the badge says "99+". Counting further is a scan nobody reads, and the cap
// is what keeps a stale channel to a hundred index entries.
const UNREAD_CAP = 100;

interface MessageRow {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly authorId: UserId;
  readonly clientId: string;
  readonly body: string;
  readonly deletedAt: Date | null;
  readonly editedAt: Date | null;
  readonly createdAt: Date;
}

export class PgMessageRepository extends BaseRepository implements MessageRepository {
  // One statement. Backwards from the newest, which is the direction a conversation is
  // read, and the cursor is named for that direction all the way to the client.
  public async list(
    organizationId: OrganizationId,
    query: MessageQuery,
  ): Promise<MessagePageResult> {
    const before = query.before ? KeysetCursor.decode(query.before) : null;

    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.conversationId, query.conversationId),
          before
            ? sql`(${messages.createdAt}, ${messages.id}) < (${before.at}, ${before.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return {
      items: page.map((row) => PgMessageRepository.toRecord(row)),
      olderCursor:
        rows.length > query.limit && last ? KeysetCursor.encode(last.createdAt, last.id) : null,
    };
  }

  public async findById(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    messageId: MessageId,
    createdAt: Date,
  ): Promise<MessageRecord | null> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.conversationId, conversationId),
          eq(messages.id, messageId),
          // Carried like a partition hint everywhere else, so a caller does not need to
          // know which tables are partitioned. A wrong value is no row, never another.
          eq(messages.createdAt, createdAt),
        ),
      )
      .limit(1);

    return row ? PgMessageRepository.toRecord(row) : null;
  }

  // A plain insert. The id and the timestamp arrive with the record because the send
  // dedupe holds them in Redis — see application/docs/reference/messaging.md.
  public async save(message: NewMessage): Promise<MessageRecord> {
    const [row] = await this.db
      .insert(messages)
      .values({
        id: message.id,
        organizationId: message.organizationId,
        conversationId: message.conversationId,
        authorId: message.authorId,
        clientId: message.clientId,
        body: message.body,
        createdAt: message.createdAt,
      })
      .returning();

    if (!row) throw new NotFoundError("message", message.clientId);
    return PgMessageRepository.toRecord(row);
  }

  public async edit(
    organizationId: OrganizationId,
    messageId: MessageId,
    createdAt: Date,
    body: string,
    at: Date,
  ): Promise<MessageRecord | null> {
    const [row] = await this.db
      .update(messages)
      .set({ body, editedAt: at })
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.id, messageId),
          eq(messages.createdAt, createdAt),
          isNull(messages.deletedAt),
        ),
      )
      .returning();

    return row ? PgMessageRepository.toRecord(row) : null;
  }

  // The row keeps its place so the keyset cursor over the conversation stays stable; the
  // body is blanked rather than the row removed.
  public async softDelete(
    organizationId: OrganizationId,
    messageId: MessageId,
    createdAt: Date,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(messages)
      .set({ deletedAt: at, body: "" })
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.id, messageId),
          eq(messages.createdAt, createdAt),
        ),
      );
  }

  // One statement for the whole page. A `LATERAL` per conversation, each bounded by the
  // cap, so a channel nobody has opened in a year costs a hundred index entries.
  public async unreadCounts(
    organizationId: OrganizationId,
    userId: UserId,
    conversationIds: readonly ConversationId[],
  ): Promise<readonly UnreadCount[]> {
    if (conversationIds.length === 0) return [];

    const rows = await this.db
      .select({
        conversationId: conversationMembers.conversationId,
        // Spelled out, never `${messages.conversationId}`: drizzle renders a column in a
        // raw fragment unqualified here, so every correlation came out as `x = x`.
        count: sql<number>`(
          select count(*) from (
            select 1 from messages m
            where m.organization_id = conversation_members.organization_id
              and m.conversation_id = conversation_members.conversation_id
              and m.created_at > coalesce(conversation_members.last_read_at, '-infinity'::timestamptz)
              and m.author_id <> ${userId}
              and m.deleted_at is null
            limit ${UNREAD_CAP}
          ) capped
        )`.as("count"),
      })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.organizationId, organizationId),
          eq(conversationMembers.userId, userId),
          inArray(conversationMembers.conversationId, [...conversationIds]),
        ),
      );

    return rows.map((row) => ({
      conversationId: row.conversationId,
      count: Number(row.count),
    }));
  }

  private static toRecord(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      conversationId: row.conversationId,
      authorId: row.authorId,
      clientId: row.clientId,
      body: row.body,
      deleted: row.deletedAt !== null,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
    };
  }
}

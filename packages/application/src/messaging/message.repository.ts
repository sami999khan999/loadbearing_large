import type { ConversationId, MessageId, OrganizationId, UserId } from "../import.js";

export interface MessageRecord {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly authorId: UserId;
  readonly clientId: string;
  readonly body: string;
  readonly deleted: boolean;
  readonly editedAt: Date | null;
  readonly createdAt: Date;
}

export interface MessagePageResult {
  readonly items: readonly MessageRecord[];
  readonly olderCursor: string | null;
}

export interface MessageQuery {
  readonly conversationId: ConversationId;
  readonly limit: number;
  readonly before?: string | undefined;
}

export interface NewMessage {
  readonly organizationId: OrganizationId;
  readonly conversationId: ConversationId;
  readonly authorId: UserId;
  readonly clientId: string;
  readonly body: string;
}

export interface UnreadCount {
  readonly conversationId: ConversationId;
  readonly count: number;
}

export abstract class MessageRepository {
  // Pages backwards from the newest, which is the direction a conversation is read.
  public abstract list(
    organizationId: OrganizationId,
    query: MessageQuery,
  ): Promise<MessagePageResult>;

  // `createdAt` is the partition hint everywhere else; here it keeps the same shape so a
  // caller does not have to know which tables are partitioned and which are not.
  public abstract findById(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    messageId: MessageId,
    createdAt: Date,
  ): Promise<MessageRecord | null>;

  // Returns the existing row on a `clientId` it has already seen, so a retried send is
  // one message and the caller cannot tell the difference.
  public abstract save(message: NewMessage): Promise<MessageRecord>;

  public abstract edit(
    organizationId: OrganizationId,
    messageId: MessageId,
    createdAt: Date,
    body: string,
    at: Date,
  ): Promise<MessageRecord | null>;

  // Soft: the row keeps its place so the keyset cursor over the conversation stays
  // stable, and the body is blanked rather than the row removed.
  public abstract softDelete(
    organizationId: OrganizationId,
    messageId: MessageId,
    createdAt: Date,
    at: Date,
  ): Promise<void>;

  // One statement for the whole page, capped. There is no counter column to drift —
  // `last_read_at` is the only state. See docs/reference/messaging.md.
  public abstract unreadCounts(
    organizationId: OrganizationId,
    userId: UserId,
    conversationIds: readonly ConversationId[],
  ): Promise<readonly UnreadCount[]>;
}

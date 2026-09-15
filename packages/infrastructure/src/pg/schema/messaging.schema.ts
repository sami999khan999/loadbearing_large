import {
  type ConversationId,
  index,
  type MessageId,
  type OrganizationId,
  pgTable,
  sql,
  text,
  timestamp,
  type UserId,
  uniqueIndex,
  uuid,
} from "../../import.js";
import { users } from "./auth.schema.js";
import { organizations } from "./rbac.schema.js";

// Grows with the tenant's people rather than with its activity, so it is not
// partitioned — the rule `data-and-scale.md` states for append-only tables.
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").$type<ConversationId>().primaryKey(),
    organizationId: uuid("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    // Null for a direct conversation, which the client titles from the other member.
    title: text("title"),
    // `<lowerId>_<higherId>`, and null for a channel. What makes opening the same DM
    // twice return the same row rather than a second one.
    directKey: text("direct_key"),
    createdBy: uuid("created_by").$type<UserId>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Denormalised onto the conversation because it is the list's sort key: looked up
    // per row it would be a correlated subquery on every page.
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessageId: uuid("last_message_id").$type<MessageId>(),
  },
  (t) => [
    // Partial, because NULLs are distinct in a unique index and a channel would
    // otherwise be unconstrained against every other channel. Tenant-leading, per §17.
    uniqueIndex("conversations_direct_uq")
      .on(t.organizationId, t.directKey)
      .where(sql`direct_key is not null`),
    // The list's keyset, in the order its ORDER BY asks for.
    index("conversations_recent_idx").on(t.organizationId, t.lastMessageAt.desc(), t.id.desc()),
  ],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // NO ACTION rather than RESTRICT between siblings, so a tenant delete cascading
    // from `organizations` is not rejected by this check on the way through.
    conversationId: uuid("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "no action" }),
    // Cascades: a membership is the person's, and it has no meaning without them.
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    // The **only** unread state. There is no counter column: the count is computed from
    // this, capped, so nothing can drift. See application/docs/reference/messaging.md.
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    lastReadMessageId: uuid("last_read_message_id").$type<MessageId>(),
    mutedAt: timestamp("muted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("conversation_members_uq").on(t.organizationId, t.conversationId, t.userId),
    // "Which conversations am I in", which is the list query's driving side.
    index("conversation_members_mine_idx").on(t.organizationId, t.userId, t.lastReadAt),
    index("conversation_members_conversation_fk_idx").on(t.conversationId),
    index("conversation_members_user_fk_idx").on(t.userId),
  ],
);

// **Not partitioned**, against the standing rule: a partitioned table refuses the unique
// index that is the send dedupe. See application/docs/reference/messaging.md.
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").$type<MessageId>().primaryKey(),
    organizationId: uuid("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "no action" }),
    // No foreign key. A message outlives its author's account the way the audit trail
    // outlives its actor: deleting a person must not rewrite a conversation.
    authorId: uuid("author_id").$type<UserId>().notNull(),
    // The client's own key, and the send dedupe. A retried send carries the same one.
    clientId: uuid("client_id").notNull(),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Soft: the row keeps its place so the conversation keeps its shape and the keyset
    // cursor over it stays stable. The body is blanked, not the row.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Milliseconds, not the default microseconds: every caller hands this value back as a
    // predicate. See application/docs/reference/messaging.md.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    // The send dedupe, tenant-leading per §17. Scoped to the conversation as well, so
    // two clients that happened to generate one uuid do not collide across rooms.
    uniqueIndex("messages_client_uq").on(t.organizationId, t.conversationId, t.clientId),
    // The keyset, in the exact order the backwards page asks for.
    index("messages_keyset_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index("messages_conversation_fk_idx").on(t.conversationId),
  ],
);

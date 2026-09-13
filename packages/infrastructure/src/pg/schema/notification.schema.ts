import {
  index,
  jsonb,
  type OrganizationId,
  pgTable,
  primaryKey,
  sql,
  text,
  timestamp,
  type UserId,
  uniqueIndex,
  uuid,
} from "../../import.js";
import { users } from "./auth.schema.js";
import { organizations } from "./rbac.schema.js";

// Declared as an ordinary table so the query builder types it; the generated DDL is
// hand-edited to `PARTITION BY RANGE (created_at)` before it is applied.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").notNull(),
    organizationId: uuid("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Cascades, unlike the audit trail's actor: an inbox is the person's own, and it
    // has no reason to outlive the account.
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The outbox event that produced it. No foreign key: retention drops an event
    // months before it drops the notification, and a cascade would take the inbox too.
    eventId: uuid("event_id").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    params: jsonb("params").$type<Record<string, string>>().notNull().default({}),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres requires the partition key in the primary key. `Uuid.v7()` is
    // time-ordered, so the key and the partition column still increase together.
    primaryKey({ columns: [t.id, t.createdAt] }),
    // The keyset, in the exact order the list's ORDER BY asks for.
    index("notifications_inbox_idx").on(
      t.organizationId,
      t.userId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    // The bell's count, partial so the index holds only what it will ever be asked for.
    index("notifications_unread_idx").on(t.organizationId, t.userId).where(sql`read_at is null`),
    // The idempotency key, and `createdAt` is in it because a partitioned table demands
    // the partition column — sound only because that value is the event's, not the clock's.
    uniqueIndex("notifications_dedupe_uq").on(
      t.organizationId,
      t.userId,
      t.eventId,
      t.kind,
      t.createdAt,
    ),
    index("notifications_user_fk_idx").on(t.userId),
  ],
);

// Not partitioned: bounded by users × categories × channels, so it grows with the
// tenant rather than with its activity.
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    channel: text("channel").notNull(),
    mode: text("mode").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // An absent row is the category's default from `NotificationPolicy`, so this table
    // holds only what somebody actually changed.
    uniqueIndex("notification_preferences_uq").on(
      t.organizationId,
      t.userId,
      t.category,
      t.channel,
    ),
    index("notification_preferences_user_fk_idx").on(t.userId),
  ],
);

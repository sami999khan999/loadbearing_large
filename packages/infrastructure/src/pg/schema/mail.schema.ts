import {
  check,
  index,
  integer,
  type OrganizationId,
  pgTable,
  primaryKey,
  sql,
  text,
  timestamp,
  type UserId,
  uuid,
} from "../../import.js";

// The delivery log (`26.10`): one row per message that reached an outcome, written by the
// mail consumer after the send. Singular, as an append-only table is.
export const mailDelivery = pgTable(
  "mail_delivery",
  {
    id: uuid("id").notNull(),
    // Routed, so no key to the catalog — decision `24.1`. Tenantless mail is the platform's.
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    userId: uuid("user_id").$type<UserId>(),
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    status: text("status").$type<"sent" | "failed">().notNull(),
    messageId: text("message_id"),
    attempts: integer("attempts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.organizationId, t.createdAt] }),
    index("mail_delivery_period_idx").on(t.organizationId, t.createdAt.desc(), t.id.desc()),
    index("mail_delivery_recipient_idx").on(
      t.organizationId,
      t.recipient,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index("mail_delivery_user_fk_idx").on(t.organizationId, t.userId),
    check("mail_delivery_status_ck", sql`${t.status} in ('sent', 'failed')`),
    check("mail_delivery_attempts_ck", sql`${t.attempts} >= 0`),
  ],
);

import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type UserId,
  uuid,
} from "../import.js";

// Declared as an ordinary table so the query builder types it; the generated DDL is
// hand-edited to `PARTITION BY RANGE (occurred_at)` before it is applied.
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    // A uuid now, not `text` — Better Auth is configured to mint `Uuid.v7()` ids (16), so
    // there is no foreign id format left to accommodate. Deliberately *not* a foreign key:
    // an audit row outlives the actor it names, and a cascade would erase the trail of a
    // deleted account exactly when it matters most.
    actorId: uuid("actor_id").$type<UserId>().notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres requires the partition key in the primary key. `Uuid.v7()` is
    // time-ordered, so the key and the partition column still increase together.
    primaryKey({ columns: [t.id, t.occurredAt] }),
    index("activity_log_org_time_idx").on(t.organizationId, t.occurredAt.desc()),
  ],
);

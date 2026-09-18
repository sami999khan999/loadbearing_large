import { check, integer, pgTable, primaryKey, sql, text, timestamp } from "../../import.js";

// **Global, and deliberately so.** A partition spans every tenant, so a per-tenant row
// here would describe something the storage engine cannot do.

// An absent row is the code default — `PartitionedTable.ALL` — which is what makes an
// empty table behave exactly as the deploy before it did.
export const retentionPolicy = pgTable(
  "retention_policy",
  {
    // `postgres` or `clickhouse`. Two stores with two different meanings of "retention",
    // and one table because the screen edits them side by side.
    store: text("store", { enum: ["postgres", "clickhouse"] }).notNull(),
    // Never from data: validated against `PartitionedTable.NAMES` in the use-case, which
    // is the same closed union every DDL path inlines.
    tableName: text("table_name").notNull(),
    // Months kept in the hot store. At least one: zero would drop the current month,
    // which is the one being written to.
    hotMonths: integer("hot_months").notNull(),
    // Months kept in cold storage after that. Null is "never expires", which is a
    // different statement from zero — zero deletes the object as soon as it lands.
    coldMonths: integer("cold_months"),
    // `drop` skips the archive step entirely. It is here because a table of transport
    // rows may genuinely not be worth the bytes, and the screen says what it costs.
    coldMode: text("cold_mode", { enum: ["archive", "drop"] })
      .notNull()
      .default("archive"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.store, t.tableName] }),
    // In the database as well as in the use-case. The use-case is the message a person
    // reads; this is what holds when a row is written by hand at 3am.
    check("retention_policy_hot_months_ck", sql`${t.hotMonths} >= 1`),
    check("retention_policy_cold_months_ck", sql`${t.coldMonths} is null or ${t.coldMonths} >= 0`),
  ],
);

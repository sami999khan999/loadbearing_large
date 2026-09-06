import { date, integer, pgTable, text, timestamp } from "../../import.js";

// Where a detached `activity_log` partition went. This is what makes a ClickHouse
// replay past the Postgres retention window automatable rather than archaeology.
export const activityArchive = pgTable("activity_archive", {
  period: date("period", { mode: "string" }).primaryKey(),
  objectKey: text("object_key").notNull(),
  // The count the partition held. Reconciliation compares against this for months
  // Postgres no longer has, which is the only check covering the cold window.
  rowCount: integer("row_count").notNull(),
  checksum: text("checksum").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
});

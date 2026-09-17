import {
  date,
  integer,
  type OrganizationId,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "../../import.js";

// Where a detached `activity_log` partition went — what makes a ClickHouse replay past
// the retention window automatable. One row per tenant per month, as a partition is.
export const activityArchive = pgTable(
  "activity_archive",
  {
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    period: date("period", { mode: "string" }).notNull(),
    objectKey: text("object_key").notNull(),
    // The count the partition held. Reconciliation compares against this for months
    // Postgres no longer has, which is the only check covering the cold window.
    rowCount: integer("row_count").notNull(),
    checksum: text("checksum").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // No foreign key to `organizations`, for the reason the audit trail gives about its
  // actor: the archive is what survives the tenant, and a cascade would erase it.
  (t) => [primaryKey({ columns: [t.organizationId, t.period] })],
);

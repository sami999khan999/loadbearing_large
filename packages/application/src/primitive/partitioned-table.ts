const ACTIVITY_LOG = "activity_log";

// Frozen at module load for the reason `QueueName` gives: `static readonly` freezes the
// binding and not the array.
const ALL = Object.freeze([ACTIVITY_LOG] as const);

// A closed union rather than `string`, and that is not style. Postgres accepts no bind
// parameters in DDL, so the adapter inlines this value — the type is the only boundary.
export type PartitionedTableName = (typeof ALL)[number];

// Every table this system partitions by month. A table joins the list in the migration
// that partitions it, and the maintenance schedule then covers it with no further edit.
export class PartitionedTable {
  private constructor() {}

  public static readonly ACTIVITY_LOG = ACTIVITY_LOG;

  public static readonly ALL = ALL;
}

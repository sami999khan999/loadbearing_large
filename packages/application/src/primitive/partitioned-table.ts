const ACTIVITY_LOG = "activity_log";
const OUTBOX_EVENT = "outbox_event";
const NOTIFICATIONS = "notifications";

// The column the table is ranged by. A closed union rather than `string`: it is inlined
// into DDL and into every predicate that wants a partition pruned.
export type PartitionColumn = "occurred_at" | "created_at";

// One table's whole partitioning policy. `retentionMonths` of `null` means this table is
// never dropped by the calendar — something else owns its lifecycle.
export interface PartitionedTableEntry {
  readonly name: string;
  readonly column: PartitionColumn;
  readonly retentionMonths: number | null;
}

// Frozen at module load for the reason `QueueName` gives: `static readonly` freezes the
// binding and not the array.
const ALL = Object.freeze([
  // Never pruned here. `archive` detaches it, verifies the upload and *then* drops it;
  // a calendar drop beside that would race the verification.
  Object.freeze({ name: ACTIVITY_LOG, column: "occurred_at", retentionMonths: null }),
  // Two months. A pending row older than that is one the drain never reached, which is
  // an incident rather than a retention question — `outboxIsBehind` holds the drop.
  Object.freeze({ name: OUTBOX_EVENT, column: "occurred_at", retentionMonths: 2 }),
  // Twelve months. An inbox older than a year is not read, and the row is derived from
  // an event whose own partition went two months in.
  Object.freeze({ name: NOTIFICATIONS, column: "created_at", retentionMonths: 12 }),
] as const) satisfies readonly PartitionedTableEntry[];

// A closed union rather than `string`: Postgres accepts no bind parameters in DDL, so
// the adapter inlines this value and the type is the only boundary.
export type PartitionedTableName = (typeof ALL)[number]["name"];

// Built once and frozen: a `static readonly` Map is mutable state wearing a keyword.
const BY_NAME: ReadonlyMap<string, PartitionedTableEntry> = new Map(
  ALL.map((entry) => [entry.name, entry]),
);

// Every table this system partitions by month, and the whole policy for each. A table
// joins the list in the migration that partitions it; the schedule then covers it.
export class PartitionedTable {
  private constructor() {}

  public static readonly ACTIVITY_LOG = ACTIVITY_LOG;
  public static readonly OUTBOX_EVENT = OUTBOX_EVENT;
  public static readonly NOTIFICATIONS = NOTIFICATIONS;

  public static readonly ALL = ALL;

  // Total over `PartitionedTableName`, so a caller never handles an absent entry — the
  // union is derived from this same list.
  public static byName(name: PartitionedTableName): PartitionedTableEntry {
    const entry = BY_NAME.get(name);
    if (!entry) throw new Error(`Not a partitioned table: ${name}`);
    return entry;
  }

  // The names alone, for the callers that iterate tables rather than policy.
  public static readonly NAMES: readonly PartitionedTableName[] = Object.freeze(
    ALL.map((entry) => entry.name),
  );
}

const ACTIVITY_LOG = "activity_log";
const OUTBOX_EVENT = "outbox_event";
const NOTIFICATIONS = "notifications";
const MESSAGES = "messages";
const CONVERSATIONS = "conversations";
const CONVERSATION_MEMBERS = "conversation_members";
const NOTIFICATION_PREFERENCES = "notification_preferences";
const DOCUMENT_CHUNKS = "document_chunks";

// The column the table is ranged by. A closed union rather than `string`: it is inlined
// into DDL and into every predicate that wants a partition pruned.
export type PartitionColumn = "occurred_at" | "created_at";

// The column the table is split by tenant on. Declared once, so a fork sharding on a
// store or a region edits this alias and its schema rather than eight call sites.
export type TenantKey = "organization_id";

// One table's whole partitioning policy. `tenantKey` of `null` is "not split by tenant";
// `column` of `null` is "tenant level only, never pruned by the calendar".
export interface PartitionedTableEntry {
  readonly name: string;
  readonly tenantKey: TenantKey | null;
  readonly column: PartitionColumn | null;
  readonly retentionMonths: number | null;
}

// **A table is listed after the tables it references**, because `dropTenantPartitions`
// walks this backwards — see packages/infrastructure/docs/reference/partitions.md.

// Frozen at module load for the reason `QueueName` gives: `static readonly` freezes the
// binding and not the array.
const ALL = Object.freeze([
  // Never pruned here. `archive` detaches it, verifies the upload and *then* drops it;
  // a calendar drop beside that would race the verification.
  Object.freeze({
    name: ACTIVITY_LOG,
    tenantKey: "organization_id",
    column: "occurred_at",
    retentionMonths: null,
  }),
  // The one table with no tenant level. The drain polls it once a second and must not
  // touch a partition per tenant to do it.
  Object.freeze({
    name: OUTBOX_EVENT,
    tenantKey: null,
    column: "occurred_at",
    retentionMonths: 2,
  }),
  // Twelve months. An inbox older than a year is not read, and the row is derived from
  // an event whose own partition went two months in.
  Object.freeze({
    name: NOTIFICATIONS,
    tenantKey: "organization_id",
    column: "created_at",
    retentionMonths: 12,
  }),
  // Ahead of the two tables that reference it, which is what makes the reverse of this
  // list a safe drop order. It grows with the tenant, so it takes no month level.
  Object.freeze({
    name: CONVERSATIONS,
    tenantKey: "organization_id",
    column: null,
    retentionMonths: null,
  }),
  Object.freeze({
    name: CONVERSATION_MEMBERS,
    tenantKey: "organization_id",
    column: null,
    retentionMonths: null,
  }),
  // Never dropped by the calendar: messages are domain data, so the month level buys a
  // manageable table and a ready archive path rather than a retention policy.
  Object.freeze({
    name: MESSAGES,
    tenantKey: "organization_id",
    column: "created_at",
    retentionMonths: null,
  }),
  Object.freeze({
    name: NOTIFICATION_PREFERENCES,
    tenantKey: "organization_id",
    column: null,
    retentionMonths: null,
  }),
  Object.freeze({
    name: DOCUMENT_CHUNKS,
    tenantKey: "organization_id",
    column: null,
    retentionMonths: null,
  }),
] as const) satisfies readonly PartitionedTableEntry[];

// A closed union rather than `string`: Postgres accepts no bind parameters in DDL, so
// the adapter inlines this value and the type is the only boundary.
export type PartitionedTableName = (typeof ALL)[number]["name"];

// Built once and frozen: a `static readonly` Map is mutable state wearing a keyword.
const BY_NAME: ReadonlyMap<string, PartitionedTableEntry> = new Map(
  ALL.map((entry) => [entry.name, entry]),
);

// Derived rather than listed, so adding an entry is the whole change. Neither is
// annotated: `readonly PartitionedTableEntry[]` would widen `name` back to `string`.
const TENANT_PARTITIONED = Object.freeze(
  ALL.filter((entry): entry is Extract<typeof entry, { tenantKey: TenantKey }> => {
    return entry.tenantKey !== null;
  }),
);

const MONTH_PARTITIONED = Object.freeze(
  ALL.filter((entry): entry is Extract<typeof entry, { column: PartitionColumn }> => {
    return entry.column !== null;
  }),
);

// Every table this system partitions, and the whole policy for each. A table joins the
// list in the migration that partitions it; the schedule and the seed then cover it.
export class PartitionedTable {
  private constructor() {}

  public static readonly ACTIVITY_LOG = ACTIVITY_LOG;
  public static readonly OUTBOX_EVENT = OUTBOX_EVENT;
  public static readonly NOTIFICATIONS = NOTIFICATIONS;
  public static readonly MESSAGES = MESSAGES;
  public static readonly CONVERSATIONS = CONVERSATIONS;
  public static readonly CONVERSATION_MEMBERS = CONVERSATION_MEMBERS;
  public static readonly NOTIFICATION_PREFERENCES = NOTIFICATION_PREFERENCES;
  public static readonly DOCUMENT_CHUNKS = DOCUMENT_CHUNKS;

  public static readonly ALL = ALL;

  // The tenant level, and the month level under it. Both are read by the seed, the
  // maintenance gateway and the schedule, so neither is re-derived at a call site.
  public static readonly TENANT_PARTITIONED = TENANT_PARTITIONED;
  public static readonly MONTH_PARTITIONED = MONTH_PARTITIONED;

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

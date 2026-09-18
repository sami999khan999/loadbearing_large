import { z } from "../import.js";
import { Identifiers, Pagination } from "../primitive/index.js";

export class PlatformContract {
  private constructor() {}

  // Three states per dependency, and the third is the one that matters: `null` is "this
  // deployment runs none", which is neither healthy nor degraded.
  public static readonly dependency = z.boolean().nullable();

  public static readonly health = z.object({
    healthy: z.boolean(),
    database: z.boolean(),
    cache: z.boolean(),
    queue: z.boolean(),
    analytics: PlatformContract.dependency,
    realtime: PlatformContract.dependency,
  });

  public static readonly organization = z.object({
    id: Identifiers.organizationId,
    slug: z.string().min(1),
    name: z.string().min(1),
  });

  public static readonly status = z.object({
    organization: PlatformContract.organization,
    health: PlatformContract.health,
  });

  // `archive` drops the month behind a verified object; `drop` destroys it. Two words
  // rather than a boolean, because `skipArchive: false` reads as the opposite.
  public static readonly coldMode = z.enum(["archive", "drop"]);

  public static readonly store = z.enum(["postgres", "clickhouse"]);

  public static readonly retentionEntry = z.object({
    tableName: z.string().min(1),
    // Null is "the calendar never retires this table" — `messages`, which is domain
    // data. Not zero, which would mean dropping the month being written to.
    hotMonths: z.number().int().nullable(),
    coldMonths: z.number().int().nullable(),
    coldMode: PlatformContract.coldMode,
    // True when the numbers come from the allowlist rather than a row. "12 because
    // nobody has decided" reads differently on a screen from "12".
    isDefault: z.boolean(),
    neverDropped: z.boolean(),
  });

  public static readonly clickhouseRetention = z.object({
    months: z.number().int(),
    isDefault: z.boolean(),
    // What the store holds beside what the rows compose to. A screen showing only the
    // rows would say "saved" about a call that failed after the commit.
    applied: z.string(),
    expected: z.string(),
  });

  public static readonly retention = z.object({
    postgres: z.array(PlatformContract.retentionEntry).readonly(),
    // Absent on a deployment running no analytics store, which is the third state the
    // screen renders — not configured, rather than on or off.
    clickhouse: PlatformContract.clickhouseRetention.nullable(),
    lifecycle: z.object({
      applied: z.array(z.string()).readonly(),
      expected: z.array(z.string()).readonly(),
    }),
  });

  // The tenant leads, as the row does. `tableName` is still a string and still
  // validated one layer in, for the reason every other table name here is.
  public static readonly tenantRetentionUpdate = z.object({
    organizationId: Identifiers.organizationId,
    tableName: z.string().min(1).max(64),
    hotMonths: z.number().int().min(1).max(600),
    coldMonths: z.number().int().min(0).max(600).nullable(),
  });

  public static readonly restore = z.object({
    tableName: z.string().min(1).max(64),
    // The first of a month, which is what `partition_archive` stores and what a replay
    // is asked for. A mid-month date names no partition.
    period: z.string().regex(/^\d{4}-\d{2}-01$/),
    // Absent restores every tenant that has a row for the month, which is what an
    // operator means by "restore March".
    organizationId: Identifiers.organizationId.optional(),
  });

  public static readonly restoreRequested = z.object({
    jobId: z.string().min(1),
    objects: z.number().int(),
  });

  public static readonly previewQuery = z.object({
    tableName: z.string().min(1).max(64),
    hotMonths: z.coerce.number().int().min(1).max(600),
  });

  public static readonly retentionPreview = z.object({
    tableName: z.string().min(1),
    hotMonths: z.number().int(),
    partitions: z
      .array(
        z.object({
          name: z.string().min(1),
          period: z.string().min(1),
          estimatedRows: z.number().int(),
          bytes: z.number().int(),
        }),
      )
      .readonly(),
    totalPartitions: z.number().int(),
    // The planner's number, refreshed by autovacuum — the screen says "about", and the
    // field is named for what it is rather than for what a reader would like it to be.
    estimatedRows: z.number().int(),
    bytes: z.number().int(),
  });

  // Cold storage only, and the screen says so: a partition holds one tenant's rows,
  // but Postgres reports size per table, so hot bytes cannot be attributed here.
  public static readonly tenantStorageRow = z.object({
    organizationId: Identifiers.organizationId,
    // Null once the tenant is deleted: the archive outlives it by thirty days, and a
    // row whose name resolves to nothing is what an operator came here to find.
    organizationName: z.string().nullable(),
    tableName: z.string().min(1),
    bytes: z.number().int(),
    rows: z.number().int(),
    months: z.number().int(),
  });

  public static readonly tenantStorageMonth = z.object({
    tableName: z.string().min(1),
    period: z.string().min(1),
    bytes: z.number().int(),
    rows: z.number().int(),
    actionCounts: z.record(z.string(), z.number().int()),
    projectedAt: z.date().nullable(),
  });

  public static readonly tenantStorageQuery = Pagination.query.extend({
    // Narrows the page to one tenant and fills `months`. Absent is the league table,
    // which is the question this screen usually answers.
    organizationId: Identifiers.organizationId.optional(),
  });

  public static readonly tenantStorage = z.object({
    items: z.array(PlatformContract.tenantStorageRow).readonly(),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    months: z.array(PlatformContract.tenantStorageMonth).readonly(),
  });

  // `tableName` stays a string and is validated against `PartitionedTable.NAMES` in the
  // use-case: a table name never comes from data, and the closed union is one layer in.
  public static readonly retentionUpdate = z.object({
    store: PlatformContract.store,
    tableName: z.string().min(1).max(64),
    hotMonths: z.number().int().min(1).max(600),
    coldMonths: z.number().int().min(0).max(600).nullable(),
    coldMode: PlatformContract.coldMode,
  });
}

export type ColdModeDto = z.infer<typeof PlatformContract.coldMode>;
export type PlatformHealthDto = z.infer<typeof PlatformContract.health>;
export type RetentionDto = z.infer<typeof PlatformContract.retention>;
export type RetentionEntryDto = z.infer<typeof PlatformContract.retentionEntry>;
export type RestoreInput = z.infer<typeof PlatformContract.restore>;
export type TenantRetentionUpdateInput = z.infer<typeof PlatformContract.tenantRetentionUpdate>;
export type RestoreRequestedDto = z.infer<typeof PlatformContract.restoreRequested>;
export type RetentionPreviewDto = z.infer<typeof PlatformContract.retentionPreview>;
export type RetentionUpdateInput = z.infer<typeof PlatformContract.retentionUpdate>;
export type TenantStorageDto = z.infer<typeof PlatformContract.tenantStorage>;
export type TenantStorageRowDto = z.infer<typeof PlatformContract.tenantStorageRow>;
export type TenantStorageMonthDto = z.infer<typeof PlatformContract.tenantStorageMonth>;
export type TenantStorageQuery = z.infer<typeof PlatformContract.tenantStorageQuery>;
export type PlatformStatusDto = z.infer<typeof PlatformContract.status>;

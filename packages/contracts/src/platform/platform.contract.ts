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

  // The slug travels with the id and the server compares them. A confirmation only
  // the browser checks is a confirmation the API does not have.
  public static readonly tenantDelete = z.object({
    organizationId: Identifiers.organizationId,
    slug: z.string().min(1).max(64),
  });

  public static readonly projectionGap = z.object({
    tableName: z.string().min(1),
    period: z.string().min(1),
    // Objects carrying a null `projected_at`, not objects that exist. The reason a
    // gap exists is on a log line and not stored, so this says only that one does.
    tenants: z.number().int(),
    rows: z.number().int(),
  });

  public static readonly reproject = z.object({
    period: z.string().regex(/^\d{4}-\d{2}-01$/),
    organizationId: Identifiers.organizationId.optional(),
  });

  public static readonly reprojectRequested = z.object({
    jobId: z.string().min(1),
    objects: z.number().int(),
  });

  public static readonly policy = z.object({
    projectionEnabled: z.boolean(),
    replicaReadsEnabled: z.boolean(),
    // The third state, and the one the screen has to render differently: absent is
    // "this deployment runs no analytics store", which is neither on nor off.
    analyticsConfigured: z.boolean(),
  });

  public static readonly projectionToggle = z.object({ enabled: z.boolean() });

  public static readonly projectionEntry = z.object({
    action: z.string().min(1),
    label: z.string().min(1),
    // The action's own prefix. The screen groups by it, which is the only reason it
    // is on the wire rather than derived again in the browser.
    module: z.string().min(1),
    projected: z.boolean(),
    ttlMonths: z.number().int().nullable(),
    isDefault: z.boolean(),
  });

  public static readonly projection = z.object({
    actions: z.array(PlatformContract.projectionEntry).readonly(),
    defaultMonths: z.number().int(),
    // What the store holds beside what the rows compose to, so the screen can show
    // drift rather than assume the last write landed.
    applied: z.string(),
    expected: z.string(),
    // The third state: not configured, rather than on or off.
    configured: z.boolean(),
  });

  // `action` stays a string and is validated against `ActivityActions.isKnown` one
  // layer in, for the reason every table name here is.
  public static readonly projectionUpdate = z.object({
    action: z.string().min(1).max(128),
    projected: z.boolean(),
    ttlMonths: z.number().int().min(1).max(120).nullable(),
  });

  public static readonly tenantExport = z.object({
    organizationId: Identifiers.organizationId,
  });

  public static readonly exportRequested = z.object({
    jobId: z.string().min(1),
  });

  public static readonly tenantExportObject = z.object({
    key: z.string().min(1),
    day: z.string(),
    // Presigned and short-lived. Never a permanent public URL, which is why this is
    // read on every render rather than stored.
    url: z.string().min(1),
  });

  public static readonly tenantDeleted = z.object({
    // What it cost, so the screen can say what happened rather than "done".
    archived: z.number().int(),
    partitions: z.number().int(),
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
export type TenantDeleteInput = z.infer<typeof PlatformContract.tenantDelete>;
export type PlatformPolicyDto = z.infer<typeof PlatformContract.policy>;
export type ProjectionGapDto = z.infer<typeof PlatformContract.projectionGap>;
export type ReprojectInput = z.infer<typeof PlatformContract.reproject>;
export type ReprojectRequestedDto = z.infer<typeof PlatformContract.reprojectRequested>;
export type ProjectionToggleInput = z.infer<typeof PlatformContract.projectionToggle>;
export type ProjectionDto = z.infer<typeof PlatformContract.projection>;
export type ProjectionEntryDto = z.infer<typeof PlatformContract.projectionEntry>;
export type ProjectionUpdateInput = z.infer<typeof PlatformContract.projectionUpdate>;
export type TenantExportInput = z.infer<typeof PlatformContract.tenantExport>;
export type ExportRequestedDto = z.infer<typeof PlatformContract.exportRequested>;
export type TenantExportObjectDto = z.infer<typeof PlatformContract.tenantExportObject>;
export type TenantDeletedDto = z.infer<typeof PlatformContract.tenantDeleted>;
export type TenantStorageDto = z.infer<typeof PlatformContract.tenantStorage>;
export type TenantStorageRowDto = z.infer<typeof PlatformContract.tenantStorageRow>;
export type TenantStorageMonthDto = z.infer<typeof PlatformContract.tenantStorageMonth>;
export type TenantStorageQuery = z.infer<typeof PlatformContract.tenantStorageQuery>;
export type PlatformStatusDto = z.infer<typeof PlatformContract.status>;

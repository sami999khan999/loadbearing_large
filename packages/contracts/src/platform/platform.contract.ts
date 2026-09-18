import { z } from "../import.js";
import { Identifiers } from "../primitive/index.js";

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
export type RetentionPreviewDto = z.infer<typeof PlatformContract.retentionPreview>;
export type RetentionUpdateInput = z.infer<typeof PlatformContract.retentionUpdate>;
export type PlatformStatusDto = z.infer<typeof PlatformContract.status>;

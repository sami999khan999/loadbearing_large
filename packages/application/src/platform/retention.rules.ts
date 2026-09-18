import type { LifecycleRule } from "../port/index.js";
import type { RetentionPolicyRecord } from "./retention-policy.repository.js";

// The average Gregorian month. S3 counts days and the policy is written in months, so
// one has to give — and the screen says "about", which is the honest word.
const DAYS_PER_MONTH = 30.44;

// One rule per table, never per tenant-month: lifecycle rules match a prefix and are
// capped at 1,000 per bucket, so a shorter per-tenant window is the worker's job.
const COLD_PREFIX = "cold/";

// The only rule not composed from a row. An export is a copy of a tenant's data in a
// bucket, and seven days is how long that is a download rather than a liability.
const EXPORT_PREFIX = "export/";
const EXPORT_DAYS = 7;

// ClickHouse's own spelling: it rewrites `INTERVAL 5 MONTH` as `toIntervalMonth(5)`, so
// emitting the readable form would make the daily comparison rewrite the table forever.
const TTL_COLUMN = "toDateTime(occurred_at)";

// Pure. Every number the screen shows and every expression either store receives is
// composed here, so the screen and the worker cannot drift.
export class RetentionRules {
  private constructor() {}

  // Five years, matching the shipped `0000` migration — the default an absent
  // `clickhouse` row falls back to, as an absent postgres row falls back to the allowlist.
  public static readonly DEFAULT_CLICKHOUSE_MONTHS = 60;

  // Sorted by prefix, so two runs over the same rows compare equal — otherwise the daily
  // job rewrites the bucket every time the row order changes.
  public static lifecycleFor(rows: readonly RetentionPolicyRecord[]): readonly LifecycleRule[] {
    const cold = rows
      .filter((row) => row.store === "postgres" && row.coldMonths !== null)
      .map((row) => ({
        prefix: `${COLD_PREFIX}${row.tableName}/`,
        expireAfterDays: RetentionRules.daysFor(row.coldMonths ?? 0),
      }));

    return [...cold, { prefix: EXPORT_PREFIX, expireAfterDays: EXPORT_DAYS }].sort((left, right) =>
      left.prefix.localeCompare(right.prefix),
    );
  }

  // In the form ClickHouse reads back. `perAction` is Phase 20's: the default clause has
  // to carry the exclusions, because an unconditioned TTL deletes every row it matches.
  public static clickhouseTtlFor(months: number, perAction: readonly string[] = []): string {
    const base = `${TTL_COLUMN} + toIntervalMonth(${months})`;
    if (perAction.length === 0) return base;

    const excluded = perAction.map((action) => `'${action}'`).join(", ");
    return `${base} WHERE action NOT IN (${excluded})`;
  }

  // Rounded up, never down: rounding down expires an object inside the window an
  // operator asked for, which is the direction that loses data.
  public static daysFor(months: number): number {
    return Math.ceil(months * DAYS_PER_MONTH);
  }

  // Whether the bucket already holds what the rows describe. Both sides are sorted, so
  // comparing the serialised form is what makes "apply on difference" one expression.
  public static lifecycleMatches(
    expected: readonly LifecycleRule[],
    actual: readonly LifecycleRule[],
  ): boolean {
    return RetentionRules.serialise(expected) === RetentionRules.serialise(actual);
  }

  private static serialise(rules: readonly LifecycleRule[]): string {
    return [...rules]
      .sort((left, right) => left.prefix.localeCompare(right.prefix))
      .map((rule) => `${rule.prefix}=${rule.expireAfterDays}`)
      .join("|");
  }
}

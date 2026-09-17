import type {
  ActivityRecord,
  AnalyticsProjector,
  DailyCount,
  OrganizationId,
  ProjectionCheckpoint,
} from "../import.js";
import type { ClickHouseConnection } from "./clickhouse.connection.js";

// The only writer to the analytics store, which is what keeps it derived and rebuildable
// from `activity_log`. See docs/reference/clickhouse.md.
export class ClickHouseAnalyticsProjector implements AnalyticsProjector {
  private static readonly TABLE = "activity_events";

  public constructor(private readonly connection: ClickHouseConnection) {}

  // Read from the destination, never a cursor beside it. Per tenant, and cheap under
  // `ORDER BY (organization_id, occurred_at, id)` — ClickHouse is not per node.
  public async checkpoint(organizationId: OrganizationId): Promise<ProjectionCheckpoint> {
    const rows = await this.connection.query<{
      readonly last_occurred_at: string | null;
      readonly last_id: string | null;
    }>(
      `
      SELECT
        toString(max(occurred_at))       AS last_occurred_at,
        argMax(id, (occurred_at, id))    AS last_id
      FROM ${this.connection.qualified(ClickHouseAnalyticsProjector.TABLE)}
      WHERE organization_id = {organizationId:UUID}
    `,
      { organizationId },
    );

    const row = rows[0];
    // An empty table answers with ClickHouse's zero value rather than null, which is 1970
    // and would make a replay resume after every row ever written.
    if (!row?.last_occurred_at || row.last_occurred_at.startsWith("1970-01-01")) {
      return { lastOccurredAt: null, lastId: null };
    }

    return {
      lastOccurredAt: new Date(`${row.last_occurred_at.replace(" ", "T")}Z`),
      lastId: row.last_id,
    };
  }

  // Idempotent through `ReplacingMergeTree` keyed on the activity id, so a redelivered
  // batch overwrites rather than duplicates.
  public async project(records: readonly ActivityRecord[]): Promise<number> {
    if (records.length === 0) return 0;

    await this.connection.insert(
      ClickHouseAnalyticsProjector.TABLE,
      records.map((record) => ({
        id: record.id,
        organization_id: record.organizationId,
        occurred_at: ClickHouseAnalyticsProjector.dateTime64(record.occurredAt),
        actor_id: record.actorId,
        action: record.action,
        subject_id: record.subjectId,
        // The bag stays a string: a `Map` or `JSON` column makes every new payload field
        // a migration on a table holding years of rows, for data nothing groups by.
        payload: JSON.stringify(record.payload),
      })),
    );

    return records.length;
  }

  // `FINAL`, so an unmerged duplicate is not counted twice: a false alarm on this check
  // is how a real one stops being read.
  public async dailyCounts(
    organizationId: OrganizationId,
    from: Date,
    to: Date,
  ): Promise<readonly DailyCount[]> {
    return this.connection.query<DailyCount>(
      `
      SELECT
        formatDateTime(toDate(occurred_at), '%Y-%m-%d') AS day,
        toUInt32(count())                               AS rows
      FROM ${this.connection.qualified(ClickHouseAnalyticsProjector.TABLE)} FINAL
      WHERE organization_id = {organizationId:UUID}
        AND occurred_at >= {from:DateTime64(3)} AND occurred_at < {to:DateTime64(3)}
      GROUP BY day
      ORDER BY day
    `,
      { organizationId, from, to },
    );
  }

  public async healthy(): Promise<boolean> {
    return this.connection.healthy();
  }

  public async close(): Promise<void> {
    await this.connection.close();
  }

  private static dateTime64(value: Date): string {
    return value.toISOString().replace("T", " ").replace("Z", "");
  }
}

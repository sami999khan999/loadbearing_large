import type {
  ActivityRecord,
  AnalyticsProjector,
  DailyCount,
  ProjectionCheckpoint,
} from "../import.js";
import type { ClickHouseConnection } from "./clickhouse.connection.js";

// The only writer to the analytics store, and the guard that keeps it derived.
//
// Everything here is a replay of `activity_log`: drop the whole database, run the
// projection from an empty checkpoint, and the rows come back. That property is what
// makes adopting ClickHouse a performance decision rather than a correctness one, and
// it survives exactly as long as this stays the only class that inserts.
export class ClickHouseAnalyticsProjector implements AnalyticsProjector {
  private static readonly TABLE = "activity_events";

  public constructor(private readonly connection: ClickHouseConnection) {}

  // Read from the destination, never from a cursor kept beside it. A checkpoint in
  // Postgres or Redis can disagree with what actually landed — the batch that was
  // acknowledged and then failed to insert — and the disagreement is silent. Asking
  // the table what its own last row is cannot be wrong in that direction.
  //
  // `max(occurred_at)` and the id that carries it, matching the `(occurredAt, id)`
  // keyset the reader paginates on.
  public async checkpoint(): Promise<ProjectionCheckpoint> {
    const rows = await this.connection.query<{
      readonly last_occurred_at: string | null;
      readonly last_id: string | null;
    }>(`
      SELECT
        toString(max(occurred_at))       AS last_occurred_at,
        argMax(id, (occurred_at, id))    AS last_id
      FROM ${this.connection.qualified(ClickHouseAnalyticsProjector.TABLE)}
    `);

    const row = rows[0];
    // An empty table answers with ClickHouse's zero value rather than null, which is
    // 1970 and would make a replay resume after every row ever written.
    if (!row?.last_occurred_at || row.last_occurred_at.startsWith("1970-01-01")) {
      return { lastOccurredAt: null, lastId: null };
    }

    return {
      lastOccurredAt: new Date(`${row.last_occurred_at.replace(" ", "T")}Z`),
      lastId: row.last_id,
    };
  }

  // Idempotent through `ReplacingMergeTree` keyed on the activity id: a redelivered
  // batch overwrites rather than duplicates. `FINAL` on the read side is what makes
  // the dedup visible before a background merge has run.
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
        // The bag stays a string. Typing it as a ClickHouse `Map` or `JSON` column
        // would make every new payload field a schema migration on a table holding
        // years of rows, for data nothing groups by.
        payload: JSON.stringify(record.payload),
      })),
    );

    return records.length;
  }

  // `FINAL`, so a duplicate that has not merged yet is not counted twice. A
  // reconciliation that reports drift because of an unmerged part is a false alarm,
  // and a false alarm on this check is how a real one stops being read.
  public async dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]> {
    return this.connection.query<DailyCount>(
      `
      SELECT
        formatDateTime(toDate(occurred_at), '%Y-%m-%d') AS day,
        toUInt32(count())                               AS rows
      FROM ${this.connection.qualified(ClickHouseAnalyticsProjector.TABLE)} FINAL
      WHERE occurred_at >= {from:DateTime64(3)} AND occurred_at < {to:DateTime64(3)}
      GROUP BY day
      ORDER BY day
    `,
      { from, to },
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

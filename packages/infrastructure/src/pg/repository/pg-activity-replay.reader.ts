import {
  type ActivityRecord,
  type ActivityReplayReader,
  and,
  asc,
  type DailyCount,
  gt,
  gte,
  lt,
  type OrganizationId,
  or,
  type ProjectionCheckpoint,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { activityLog } from "../schema/index.js";

// The read side of the audit trail. It exists for the projection pipeline: a derived
// store that cannot be rebuilt has quietly become a source of truth.
export class PgActivityReplayReader extends BaseRepository implements ActivityReplayReader {
  // Keyset on `(occurred_at, id)`, never OFFSET. The tuple comparison is what makes the
  // checkpoint exact: `>` drops a row sharing a microsecond and `>=` replays one forever.
  public async since(
    checkpoint: ProjectionCheckpoint,
    limit: number,
  ): Promise<readonly ActivityRecord[]> {
    const after =
      checkpoint.lastOccurredAt && checkpoint.lastId
        ? or(
            gt(activityLog.occurredAt, checkpoint.lastOccurredAt),
            and(
              sql`${activityLog.occurredAt} = ${checkpoint.lastOccurredAt}`,
              gt(activityLog.id, checkpoint.lastId),
            ),
          )
        : undefined;

    const rows = await this.db
      .select({
        id: activityLog.id,
        organizationId: activityLog.organizationId,
        occurredAt: activityLog.occurredAt,
        actorId: activityLog.actorId,
        action: activityLog.action,
        payload: activityLog.payload,
      })
      .from(activityLog)
      .where(after)
      .orderBy(asc(activityLog.occurredAt), asc(activityLog.id))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId as OrganizationId,
      occurredAt: row.occurredAt,
      actorId: row.actorId,
      action: row.action,
      // Lifted out of the bag because the derived store indexes on it, and JSON
      // extraction in a column-store ORDER BY is what makes a query slow.
      subjectId: PgActivityReplayReader.subjectOf(row.payload),
      payload: row.payload,
    }));
  }

  // The Postgres half of the daily reconciliation. Neither store reaches into the other,
  // which is what keeps each adapter single-store.
  public async dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${activityLog.occurredAt}), 'YYYY-MM-DD')`.as(
          "day",
        ),
        rows: sql<number>`count(*)::int`.as("rows"),
      })
      .from(activityLog)
      .where(and(gte(activityLog.occurredAt, from), lt(activityLog.occurredAt, to)))
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    return rows;
  }

  // A convention over the payload, not a column. Reading it here keeps the guess in one
  // place, and a payload that names no subject projects a null.
  private static subjectOf(payload: Readonly<Record<string, unknown>>): string | null {
    for (const key of ["subjectId", "taskId", "goalId", "documentId", "userId"]) {
      const value = payload[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
  }
}

import {
  type ActivityRecord,
  type ActivityReplayReader,
  ActivitySubject,
  and,
  asc,
  type DailyCount,
  eq,
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
  // Keyset on `(occurred_at, id)` within one tenant: `>` drops a row sharing a microsecond,
  // `>=` replays one forever, and no tenant predicate appends every tenant's months.
  public async since(
    organizationId: OrganizationId,
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
      .where(and(eq(activityLog.organizationId, organizationId), after))
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
      subjectId: ActivitySubject.of(row.payload),
      payload: row.payload,
    }));
  }

  // The Postgres half of the daily reconciliation. Neither store reaches into the other,
  // which is what keeps each adapter single-store.
  public async dailyCounts(
    organizationId: OrganizationId,
    from: Date,
    to: Date,
  ): Promise<readonly DailyCount[]> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${activityLog.occurredAt}), 'YYYY-MM-DD')`.as(
          "day",
        ),
        rows: sql<number>`count(*)::int`.as("rows"),
      })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.organizationId, organizationId),
          gte(activityLog.occurredAt, from),
          lt(activityLog.occurredAt, to),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    return rows;
  }
}

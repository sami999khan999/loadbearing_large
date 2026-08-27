import type { OrganizationId, UserId } from "../import.js";

// One audit row, flattened. The shape a derived store is fed and the shape a
// reconciliation counts — deliberately not the domain event, because a replay reads
// rows that were written long before the current event definitions existed.
export interface ActivityRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly occurredAt: Date;
  readonly actorId: UserId;
  readonly action: string;
  // Null when the payload names no subject. Lifted out of the bag because the derived
  // store orders on it, and JSON extraction in an ORDER BY is what makes that slow.
  readonly subjectId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

// Where a projection resumes. Both halves or neither: a cursor carrying only a
// timestamp cannot separate two rows written in the same microsecond, so it either
// drops one or replays it forever.
export interface ProjectionCheckpoint {
  readonly lastOccurredAt: Date | null;
  readonly lastId: string | null;
}

// `YYYY-MM-DD` and a count. The one shape both sides of the reconciliation answer in,
// which is what lets the comparison be a diff rather than a query across two stores.
export interface DailyCount {
  readonly day: string;
  readonly rows: number;
}

// The read side of the audit trail, and the source half of the projection pipeline.
//
// It is a separate port from `ActivityLogger` on purpose. `ActivityLogger` writes
// inside a transaction and is reachable from every use-case; this reads in bulk,
// carries no `Principal`, and is reachable only from the worker. Merging them would
// put a cross-tenant scan on the port every use-case already holds.
export abstract class ActivityReplayReader {
  // Keyset pagination, ordered by `(occurredAt, id)`. Returns fewer than `limit`
  // rows exactly when it has caught up, which is what the consumer stops on.
  public abstract since(
    checkpoint: ProjectionCheckpoint,
    limit: number,
  ): Promise<readonly ActivityRecord[]>;

  // The authoritative half of the daily reconciliation. `[from, to)`.
  public abstract dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]>;
}

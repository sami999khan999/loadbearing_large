import type { OrganizationId, UserId } from "../import.js";

// One audit row, flattened — deliberately not the domain event, because a replay reads
// rows written long before the current definitions existed.
export interface ActivityRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly occurredAt: Date;
  readonly actorId: UserId;
  readonly action: string;
  // Lifted out of the payload bag because the derived store orders on it, and JSON
  // extraction in an ORDER BY is what makes that slow.
  readonly subjectId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

// Where a projection resumes. Both halves or neither: a timestamp alone cannot separate
// two rows written in the same microsecond.
export interface ProjectionCheckpoint {
  readonly lastOccurredAt: Date | null;
  readonly lastId: string | null;
}

// The one shape both sides of the reconciliation answer in, which is what lets the
// comparison be a diff rather than a query across two stores.
export interface DailyCount {
  readonly day: string;
  readonly rows: number;
}

// The read side of the audit trail. A separate port from `ActivityLogger`, because
// merging them puts a cross-tenant scan on the port every use-case holds.
export abstract class ActivityReplayReader {
  // Keyset on `(occurredAt, id)` within one tenant — a walk with no tenant predicate
  // appends every tenant's months into every batch. A short page means caught up.
  public abstract since(
    organizationId: OrganizationId,
    checkpoint: ProjectionCheckpoint,
    limit: number,
  ): Promise<readonly ActivityRecord[]>;

  // The authoritative half of the daily reconciliation. `[from, to)`, one tenant.
  public abstract dailyCounts(
    organizationId: OrganizationId,
    from: Date,
    to: Date,
  ): Promise<readonly DailyCount[]>;
}

export interface ArchivedPartition {
  // ISO `YYYY-MM-DD`, the first of the archived month — the primary key of
  // `activity_archive`, and the same string a replay is asked for.
  readonly period: string;
  readonly key: string;
  readonly rowCount: number;
}

// The fourth prerequisite for adopting a derived analytics store, and the one the
// deployment doc omits. Without a writer for `activity_archive`, replay past the
// Postgres retention window does not exist — which makes "no backups, because replay
// works" false rather than merely optimistic.
//
// Like `MaintenanceGateway`, no method carries a `Principal`: a partition spans every
// tenant, so there is no organization that could authorize archiving one.
export abstract class ActivityArchiveGateway {
  // Detach, upload, record, verify, drop — in that order, and the order is the point.
  // Dropping before verifying is unrecoverable loss of the audit trail.
  public abstract archive(period: Date): Promise<ArchivedPartition>;
}

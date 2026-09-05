export interface ArchivedPartition {
  // ISO `YYYY-MM-DD`, the first of the archived month — the primary key of
  // `activity_archive`, and the same string a replay is asked for.
  readonly period: string;
  readonly key: string;
  readonly rowCount: number;
}

// Without a writer for `activity_archive`, replay past the Postgres retention window
// does not exist. No `Principal`: a partition spans every tenant.
export abstract class ActivityArchiveGateway {
  // Detach, upload, record, verify, drop — in that order. Dropping before verifying is
  // unrecoverable loss of the audit trail.
  public abstract archive(period: Date): Promise<ArchivedPartition>;
}

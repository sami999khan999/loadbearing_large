import type { OrganizationId } from "../import.js";

export interface ArchivedPartition {
  readonly organizationId: OrganizationId;
  // ISO `YYYY-MM-DD`, the first of the archived month — half the primary key of
  // `activity_archive`, and the same string a replay is asked for.
  readonly period: string;
  readonly key: string;
  readonly rowCount: number;
}

// Without a writer for `activity_archive`, replay past the Postgres retention window does
// not exist. A tenant rather than a `Principal`: it names the partition, not the asker.
export abstract class ActivityArchiveGateway {
  // Detach, upload, record, verify, drop — in that order. Dropping before verifying is
  // unrecoverable loss of the audit trail.
  public abstract archive(organizationId: OrganizationId, period: Date): Promise<ArchivedPartition>;
}

import type { PartitionedTableName } from "../primitive/index.js";

export interface SweepOutcome {
  readonly sessions: number;
  readonly verifications: number;
  // Not housekeeping: `invitations_email_uq` is on `(organization_id, email)`, so an
  // expired row blocks re-inviting that address until something removes it.
  readonly invitations: number;
}

// Platform housekeeping, with no `Principal` on any method: nothing here belongs to a
// tenant. See docs/reference/ports.md.
export abstract class MaintenanceGateway {
  // Bounded by expiry rather than partitioned, which is the trade `sessions` documents
  // in its own schema comment. This sweep is what makes that trade hold.
  public abstract sweepExpired(now: Date): Promise<SweepOutcome>;

  // `months` counts partitions created, starting at the month `from` falls in — so three
  // is the current month and the next two, which is two months of runway.
  public abstract ensureMonthlyPartitions(
    table: PartitionedTableName,
    from: Date,
    months: number,
  ): Promise<readonly string[]>;

  // Partitions for months strictly after the one `from` falls in. A runway check has to
  // ask what *exists*, because a run that created nothing is healthy or starved alike.
  public abstract monthlyPartitionsAfter(table: PartitionedTableName, from: Date): Promise<number>;

  // Returns what it dropped. Whole partitions rather than a `DELETE`, because dropping a
  // partition is a catalog edit and deleting a month of rows is a vacuum problem.
  public abstract dropMonthlyPartitionsBefore(
    table: PartitionedTableName,
    cutoff: Date,
  ): Promise<readonly string[]>;
}

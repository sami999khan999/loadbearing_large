import type { OrganizationId } from "../import.js";
import type { PartitionedTableName } from "../primitive/index.js";

export interface SweepOutcome {
  readonly sessions: number;
  readonly verifications: number;
  // Not housekeeping: `invitations_email_uq` is on `(organization_id, email)`, so an
  // expired row blocks re-inviting that address until something removes it.
  readonly invitations: number;
}

// What the retention preview reads. `estimatedRows` is the planner's number and the
// screen says "about"; `bytes` is exact.
export interface PartitionEstimate {
  readonly name: string;
  readonly period: Date;
  readonly estimatedRows: number;
  readonly bytes: number;
}

// Platform housekeeping, with no `Principal` on any method: nothing here belongs to a
// tenant. See docs/reference/ports.md.
export abstract class MaintenanceGateway {
  // Bounded by expiry rather than partitioned, which is the trade `sessions` documents
  // in its own schema comment. This sweep is what makes that trade hold.
  public abstract sweepExpired(now: Date): Promise<SweepOutcome>;

  // The tenant level: seven partitions, plus runway months under the three with a time
  // column. Every path that creates an organization calls this in the same transaction.
  public abstract ensureTenantPartitions(
    organizationId: OrganizationId,
  ): Promise<readonly string[]>;

  // The whole tenant level for one organization, months included. What a tenant delete
  // and a tenant move each need, and the one place that drop is written.
  public abstract dropTenantPartitions(organizationId: OrganizationId): Promise<readonly string[]>;

  // Tenants with rows on this node whose `organizations` row is gone. Since `24.1` no
  // foreign key notices, so this is the nightly proof the delete path is keeping up.
  public abstract orphanedTenants(): Promise<readonly OrganizationId[]>;

  // `months` counts partitions from the month `from` falls in, so three is the current
  // month and two of runway. `organizationId` is null only for a table with no tenant.
  public abstract ensureMonthlyPartitions(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    from: Date,
    months: number,
  ): Promise<readonly string[]>;

  // Partitions for months strictly after the one `from` falls in. A runway check has to
  // ask what *exists*, because a run that created nothing is healthy or starved alike.
  public abstract monthlyPartitionsAfter(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    from: Date,
  ): Promise<number>;

  // Whole partitions rather than a `DELETE`: dropping one is a catalog edit. Null on a
  // tenant table is **every tenant**, which is `partitionsBefore`'s reading too.
  public abstract dropMonthlyPartitionsBefore(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    cutoff: Date,
  ): Promise<readonly string[]>;

  // The one case where re-attaching a restored month is right: inside the hot window,
  // so the retention pass will not argue with it. Elsewhere a restore stays scratch.
  public abstract attachMonthlyPartition(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    period: Date,
    scratchTable: string,
  ): Promise<void>;

  // The read behind the retention preview: every month partition older than the cutoff,
  // with its size. Across every tenant when `organizationId` is null.
  public abstract partitionsBefore(
    table: PartitionedTableName,
    cutoff: Date,
    organizationId?: OrganizationId | null,
  ): Promise<readonly PartitionEstimate[]>;
}

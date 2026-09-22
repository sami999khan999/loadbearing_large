import type { OrganizationId } from "../import.js";

export interface TableRowCount {
  readonly table: string;
  readonly rows: number;
}

// **The one seam that addresses two nodes at once**, which is why it is not a
// `BaseRepository`: a repository reads tables of one placement, on one node.
export abstract class TenantMoveGateway {
  // Page in, page out. Portable over a managed Postgres, where `postgres_fdw` and a
  // node-to-node credential are not — decision `24.2`.
  public abstract copy(
    organizationId: OrganizationId,
    fromNode: number,
    toNode: number,
  ): Promise<readonly TableRowCount[]>;

  // Counted on one node, so the caller can compare two answers rather than trusting
  // the copy's own tally of what it thinks it wrote.
  public abstract counts(
    organizationId: OrganizationId,
    node: number,
  ): Promise<readonly TableRowCount[]>;

  // The source rows, once the grace period is over. Detach-then-drop, never `CASCADE`,
  // for the reason `dropTenantPartitions` gives.
  public abstract dropOn(organizationId: OrganizationId, node: number): Promise<readonly string[]>;
}

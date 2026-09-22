import { type OrganizationId, type TableRowCount, TenantMoveGateway } from "../import.js";

// Rows per node per table, as a map rather than as data: a spec about the move asserts
// the counts and the order of the steps, never what a message body said.
type Rows = Map<number, Map<string, number>>;

// The one seam that addresses two nodes, so its fake has to model two. A double that
// reported the same counts on both sides would pass a copy that never ran.
export class InMemoryTenantMoveGateway extends TenantMoveGateway {
  private readonly rows: Rows = new Map();
  private readonly copies: { organizationId: string; fromNode: number; toNode: number }[] = [];
  private readonly drops: { organizationId: string; node: number }[] = [];
  private readonly prepares: { organizationId: string; node: number }[] = [];

  // Seeds what a node holds. Without it every count is zero and a move "verifies"
  // against nothing, which is the failure this fake exists to be able to show.
  public seed(node: number, table: string, rows: number): void {
    const forNode = this.rows.get(node) ?? new Map<string, number>();
    forNode.set(table, rows);
    this.rows.set(node, forNode);
  }

  // Recorded, because "was the target prepared before the copy" is the ordering a move
  // gets wrong: inserting into a table with no partition is an error, not a no-op.
  public override prepare(organizationId: OrganizationId, node: number): Promise<void> {
    this.prepares.push({ organizationId, node });
    return Promise.resolve();
  }

  public override copy(
    organizationId: OrganizationId,
    fromNode: number,
    toNode: number,
  ): Promise<readonly TableRowCount[]> {
    this.copies.push({ organizationId, fromNode, toNode });

    const source = this.rows.get(fromNode) ?? new Map<string, number>();
    for (const [table, count] of source) this.seed(toNode, table, count);

    return Promise.resolve([...source].map(([table, rows]) => ({ table, rows })));
  }

  public override counts(
    _organizationId: OrganizationId,
    node: number,
  ): Promise<readonly TableRowCount[]> {
    const forNode = this.rows.get(node) ?? new Map<string, number>();
    return Promise.resolve([...forNode].map(([table, rows]) => ({ table, rows })));
  }

  public override dropOn(organizationId: OrganizationId, node: number): Promise<readonly string[]> {
    this.drops.push({ organizationId, node });
    const dropped = [...(this.rows.get(node) ?? new Map<string, number>()).keys()];
    this.rows.delete(node);

    return Promise.resolve(dropped);
  }

  public copied(): readonly { organizationId: string; fromNode: number; toNode: number }[] {
    return this.copies;
  }

  public dropped(): readonly { organizationId: string; node: number }[] {
    return this.drops;
  }

  public prepared(): readonly { organizationId: string; node: number }[] {
    return this.prepares;
  }
}

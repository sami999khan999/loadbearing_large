import type { OrganizationId } from "../import.js";
import type { ShardAssignmentRepository, TenantMoveGateway } from "../port/index.js";

export interface ReclaimedSources {
  readonly tenants: number;
  readonly partitions: number;
}

// Assignments per read. Each one is forgotten as it is reclaimed, so the next read is
// the next batch rather than an offset into a list that is shrinking under it.
const BATCH = 50;

// The end of a move's grace period: the source copy is dropped and the way back is
// forgotten together. Run from the nightly cleanup, never on a request path.
export class ReclaimMoveSourcesUseCase {
  public constructor(
    private readonly assignments: ShardAssignmentRepository,
    private readonly move: TenantMoveGateway,
    private readonly clock: { now(): Date },
  ) {}

  public async execute(): Promise<ReclaimedSources> {
    const now = this.clock.now();
    let tenants = 0;
    let partitions = 0;

    for (;;) {
      const due = await this.assignments.droppableBefore(now, BATCH);

      for (const assignment of due) {
        if (assignment.movedFrom === null) continue;

        // The shard key is the organization id, decision D28 — branded apart only so a
        // table name cannot be passed where a key is wanted.
        const organizationId = assignment.key as string as OrganizationId;
        const dropped = await this.move.dropOn(organizationId, assignment.movedFrom);

        // After the drop, never before: a failure between the two leaves a pointer to
        // rows that are gone, which the next night drops again as a no-op.
        await this.assignments.forgetSource(assignment.key);
        tenants += 1;
        partitions += dropped.length;
      }

      if (due.length < BATCH) break;
    }

    return { tenants, partitions };
  }
}

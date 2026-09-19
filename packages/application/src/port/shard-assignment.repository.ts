import type { PaginationQuery } from "../import.js";
import type { ShardKey } from "../primitive/index.js";

export interface ShardAssignment {
  readonly key: ShardKey;
  readonly node: number;
  readonly movedAt: Date | null;
}

// The directory itself. No principal: this is a platform seam, like
// `MaintenanceGateway` — the move job and the shard map are its only readers.
export abstract class ShardAssignmentRepository {
  // Null rather than a throw: a tenant created before the directory existed has no
  // row, and node 0 is the honest answer for it.
  public abstract findByKey(key: ShardKey): Promise<ShardAssignment | null>;

  public abstract save(assignment: { key: ShardKey; node: number }): Promise<void>;

  // Paged, because the move job walks every tenant and a deployment that needs
  // sharding is one where reading them all into memory is the thing that stops working.
  public abstract all(page: PaginationQuery): Promise<readonly ShardAssignment[]>;
}

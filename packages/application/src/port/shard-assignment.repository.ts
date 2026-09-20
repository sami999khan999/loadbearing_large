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

  // Keyset on the shard key, said so rather than an offset the adapter reinterprets:
  // `String(offset)` compared as text made page two every key after `"25"`.
  public abstract all(after: ShardKey | null, limit: number): Promise<readonly ShardAssignment[]>;
}

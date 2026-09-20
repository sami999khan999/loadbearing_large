import {
  asc,
  eq,
  gt,
  type Placement,
  type ShardAssignment,
  type ShardAssignmentRepository,
  type ShardKey,
  type ShardResolver,
} from "../../import.js";
import { BaseRepository, type DatabaseCluster } from "../primitive/index.js";
import { shardAssignments } from "../schema/index.js";
import type { ShardScope, TransactionScope } from "../transaction/index.js";

export class PgShardAssignmentRepository
  extends BaseRepository
  implements ShardAssignmentRepository
{
  // The directory is read before any shard is known, which is what makes it catalog.
  protected override readonly placement: Placement = "catalog";

  public constructor(
    cluster: DatabaseCluster,
    scope: TransactionScope,
    shards: ShardScope,
    // The write invalidates the read-through cache. Without it a moved tenant keeps
    // reading the node it left for as long as the cache holds.
    private readonly resolver: ShardResolver,
  ) {
    super(cluster, scope, shards);
  }

  public async findByKey(key: ShardKey): Promise<ShardAssignment | null> {
    const rows = await this.db
      .select({
        key: shardAssignments.shardKey,
        node: shardAssignments.node,
        movedAt: shardAssignments.movedAt,
      })
      .from(shardAssignments)
      .where(eq(shardAssignments.shardKey, key))
      .limit(1);

    const row = rows[0];
    return row ? { ...row, key: row.key as ShardKey } : null;
  }

  // `moved_at` is stamped only when the node actually changes: a re-save of the same
  // placement is not a move, and a timestamp that said otherwise would misread history.
  public async save(assignment: { key: ShardKey; node: number }): Promise<void> {
    const existing = await this.findByKey(assignment.key);
    const moved = existing !== null && existing.node !== assignment.node;

    await this.db
      .insert(shardAssignments)
      .values({ shardKey: assignment.key, node: assignment.node })
      .onConflictDoUpdate({
        target: shardAssignments.shardKey,
        set: { node: assignment.node, ...(moved ? { movedAt: new Date() } : {}) },
      });

    await this.resolver.invalidate(assignment.key);
  }

  // Keyset on `shard_key`, not offset: the move job walks every tenant, and a
  // deployment that needs sharding is one where `OFFSET 40000` is the problem.
  public async all(after: ShardKey | null, limit: number): Promise<readonly ShardAssignment[]> {
    const rows = await this.db
      .select({
        key: shardAssignments.shardKey,
        node: shardAssignments.node,
        movedAt: shardAssignments.movedAt,
      })
      .from(shardAssignments)
      .where(after ? gt(shardAssignments.shardKey, after) : undefined)
      .orderBy(asc(shardAssignments.shardKey))
      .limit(limit);

    return rows.map((row) => ({ ...row, key: row.key as ShardKey }));
  }
}

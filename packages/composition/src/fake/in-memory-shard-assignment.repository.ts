import { type ShardAssignment, ShardAssignmentRepository, type ShardKey } from "../import.js";

// Rows in a Map, keyed the way the table is. Empty by default, which is the state that
// matters: a key with no row is node 0, and an unsharded deployment has no rows at all.
export class InMemoryShardAssignmentRepository extends ShardAssignmentRepository {
  private readonly rows = new Map<ShardKey, ShardAssignment>();

  public constructor(rows: readonly ShardAssignment[] = []) {
    super();
    for (const row of rows) this.rows.set(row.key, row);
  }

  public override findByKey(key: ShardKey): Promise<ShardAssignment | null> {
    return Promise.resolve(this.rows.get(key) ?? null);
  }

  public override save(assignment: { key: ShardKey; node: number }): Promise<void> {
    this.rows.set(assignment.key, { ...assignment, movedAt: null });
    return Promise.resolve();
  }

  // Sorted and cut at the cursor, the way the real one is. A fake that sliced an offset
  // would let a caller that never advances the cursor pass here and loop in production.
  public override all(after: ShardKey | null, limit: number): Promise<readonly ShardAssignment[]> {
    const ordered = [...this.rows.values()].toSorted((left, right) =>
      left.key.localeCompare(right.key),
    );
    const rest = after ? ordered.filter((row) => row.key > after) : ordered;

    return Promise.resolve(rest.slice(0, limit));
  }
}

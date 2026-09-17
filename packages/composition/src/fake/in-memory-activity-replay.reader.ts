import {
  type ActivityRecord,
  ActivityReplayReader,
  type DailyCount,
  type OrganizationId,
  type ProjectionCheckpoint,
} from "../import.js";

// Paginates the way Postgres does — keyset on `(occurredAt, id)`, not OFFSET. Ignoring
// the checkpoint would let a consumer that never advances its cursor pass every test.
export class InMemoryActivityReplayReader extends ActivityReplayReader {
  private readonly records: readonly ActivityRecord[];

  public constructor(records: readonly ActivityRecord[] = []) {
    super();
    this.records = [...records].sort((a, b) => InMemoryActivityReplayReader.byKeyset(a, b));
  }

  public override since(
    organizationId: OrganizationId,
    checkpoint: ProjectionCheckpoint,
    limit: number,
  ): Promise<readonly ActivityRecord[]> {
    const after = this.of(organizationId).filter((record) => {
      if (!checkpoint.lastOccurredAt || !checkpoint.lastId) return true;
      const delta = record.occurredAt.getTime() - checkpoint.lastOccurredAt.getTime();
      return delta > 0 || (delta === 0 && record.id > checkpoint.lastId);
    });

    return Promise.resolve(after.slice(0, limit));
  }

  public override dailyCounts(
    organizationId: OrganizationId,
    from: Date,
    to: Date,
  ): Promise<readonly DailyCount[]> {
    const counts = new Map<string, number>();

    for (const record of this.of(organizationId)) {
      if (record.occurredAt < from || record.occurredAt >= to) continue;
      const day = record.occurredAt.toISOString().slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }

    return Promise.resolve(
      [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, rows]) => ({ day, rows })),
    );
  }

  // Every read here is per tenant, the way the real reader is: a fake that answered
  // across tenants would let a consumer that lost its tenant predicate pass.
  private of(organizationId: OrganizationId): readonly ActivityRecord[] {
    return this.records.filter((record) => record.organizationId === organizationId);
  }

  private static byKeyset(a: ActivityRecord, b: ActivityRecord): number {
    const delta = a.occurredAt.getTime() - b.occurredAt.getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  }
}

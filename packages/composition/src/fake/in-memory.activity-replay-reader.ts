import {
  type ActivityRecord,
  ActivityReplayReader,
  type DailyCount,
  type ProjectionCheckpoint,
} from "../import.js";

// Holds the records it was given and paginates them the way Postgres does — keyset on
// `(occurredAt, id)`, not OFFSET. The pagination is the part worth faking honestly: a
// stub that ignored the checkpoint would let a projection consumer that never advances
// its cursor pass every test and then loop forever against a real database.
export class InMemoryActivityReplayReader extends ActivityReplayReader {
  private readonly records: readonly ActivityRecord[];

  public constructor(records: readonly ActivityRecord[] = []) {
    super();
    this.records = [...records].sort((a, b) => InMemoryActivityReplayReader.byKeyset(a, b));
  }

  public override since(
    checkpoint: ProjectionCheckpoint,
    limit: number,
  ): Promise<readonly ActivityRecord[]> {
    const after = this.records.filter((record) => {
      if (!checkpoint.lastOccurredAt || !checkpoint.lastId) return true;
      const delta = record.occurredAt.getTime() - checkpoint.lastOccurredAt.getTime();
      return delta > 0 || (delta === 0 && record.id > checkpoint.lastId);
    });

    return Promise.resolve(after.slice(0, limit));
  }

  public override dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]> {
    const counts = new Map<string, number>();

    for (const record of this.records) {
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

  private static byKeyset(a: ActivityRecord, b: ActivityRecord): number {
    const delta = a.occurredAt.getTime() - b.occurredAt.getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  }
}

import {
  type ActivityRecord,
  AnalyticsProjector,
  type DailyCount,
  type ProjectionCheckpoint,
} from "../import.js";

// Keyed on the activity id, like the real `ReplacingMergeTree`: one that appended would
// make a redelivered batch look like new work, and BullMQ redelivers.
export class InMemoryAnalyticsProjector extends AnalyticsProjector {
  private readonly rows = new Map<string, ActivityRecord>();

  public projected(): readonly ActivityRecord[] {
    return [...this.rows.values()];
  }

  // Read back out of the stored rows, so a test cannot pass by keeping a cursor the real
  // one does not have.
  public override checkpoint(): Promise<ProjectionCheckpoint> {
    const last = [...this.rows.values()].sort((a, b) => {
      const delta = a.occurredAt.getTime() - b.occurredAt.getTime();
      return delta !== 0 ? delta : a.id.localeCompare(b.id);
    })[this.rows.size - 1];

    return Promise.resolve(
      last
        ? { lastOccurredAt: last.occurredAt, lastId: last.id }
        : { lastOccurredAt: null, lastId: null },
    );
  }

  public override project(records: readonly ActivityRecord[]): Promise<number> {
    for (const record of records) this.rows.set(record.id, record);
    return Promise.resolve(records.length);
  }

  public override dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]> {
    const counts = new Map<string, number>();

    for (const record of this.rows.values()) {
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

  public override healthy(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public override close(): Promise<void> {
    return Promise.resolve();
  }
}

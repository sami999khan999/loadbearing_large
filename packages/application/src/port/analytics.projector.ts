import type { ActivityRecord, DailyCount, ProjectionCheckpoint } from "./activity-replay.reader.js";

// The only thing allowed to write to the derived store — anything else makes it a source
// of truth nobody decided to create. See docs/reference/ports.md.
export abstract class AnalyticsProjector {
  // Read from the derived store itself: a checkpoint kept beside it can disagree with
  // what landed, silently.
  public abstract checkpoint(): Promise<ProjectionCheckpoint>;

  // Idempotent by construction: rows are keyed on the activity id, so a redelivered
  // batch overwrites rather than duplicates. Returns the number written.
  public abstract project(records: readonly ActivityRecord[]): Promise<number>;

  // The derived half of the daily reconciliation. What it catches is not an outage but a
  // consumer that died quietly on a Tuesday.
  public abstract dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]>;

  public abstract healthy(): Promise<boolean>;

  public abstract close(): Promise<void>;
}

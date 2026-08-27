import type { ActivityRecord, DailyCount, ProjectionCheckpoint } from "./activity-replay.reader.js";

// The write side of the derived analytics store, and the only thing allowed to write
// to it. That restriction is the whole design: the moment a use-case writes here
// directly, or a hand-run backfill invents a row, the store stops being rebuildable
// and has become a source of truth nobody decided to create.
//
// Split from `AnalyticsReader` rather than folded into it because the reader is
// reachable from a request path and this is not. A single port with both would put
// `project()` on the object a dashboard query holds.
export abstract class AnalyticsProjector {
  // Where the last run stopped, read from the derived store itself rather than kept
  // beside it. A checkpoint stored anywhere else can disagree with what actually
  // landed, and the disagreement is silent — this cannot be wrong about its own rows.
  public abstract checkpoint(): Promise<ProjectionCheckpoint>;

  // Idempotent by construction: rows are keyed on the activity id, so a redelivered
  // batch overwrites rather than duplicates. Returns the number written.
  public abstract project(records: readonly ActivityRecord[]): Promise<number>;

  // The derived half of the daily reconciliation, in the same shape the authoritative
  // half answers in. The realistic failure this catches is not an outage — it is a
  // consumer that died quietly on a Tuesday and was noticed a quarter later.
  public abstract dailyCounts(from: Date, to: Date): Promise<readonly DailyCount[]>;

  public abstract healthy(): Promise<boolean>;

  public abstract close(): Promise<void>;
}

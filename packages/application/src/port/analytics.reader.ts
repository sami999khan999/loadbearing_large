import type { GoalId, UserId } from "../import.js";

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface RiskScore {
  readonly goalId: GoalId;
  // 0 (no risk) to 1 (certain). A ratio, not a percentage — display decides the format.
  readonly score: number;
  // When the projection wrote the row, not a domain timestamp. Without it a dashboard
  // cannot tell a live score from one whose consumer died quietly on a Tuesday.
  readonly computedAt: Date;
}

export interface TrendPoint {
  // ISO `YYYY-MM-DD`. A string, not a `Date`: Postgres `date_trunc` and ClickHouse
  // `toYYYYMM` return different shapes, so each adapter normalises to one here.
  readonly period: string;
  readonly value: number;
}

// Aggregate reads over time — the questions a dashboard asks, not the ones a screen
// asks. Read-only by construction: a write method makes a derived store authoritative.
export abstract class AnalyticsReader {
  // `goalIds` is the caller's already-resolved permitted scope. An analytics store has
  // no `CapabilitySet` and no join back to goal membership, least of all a remote one.
  public abstract goalRiskScores(goalIds: readonly GoalId[]): Promise<readonly RiskScore[]>;

  public abstract reliabilityTrend(
    userId: UserId,
    goalIds: readonly GoalId[],
    window: DateRange,
  ): Promise<readonly TrendPoint[]>;
}

import type { GoalId, UserId } from "../import.js";

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface RiskScore {
  readonly goalId: GoalId;
  // 0 (no risk) to 1 (certain). A ratio, not a percentage — display decides the format.
  readonly score: number;
  // When the projection wrote the row, not a domain timestamp: without it a dashboard
  // cannot tell a live score from a dead consumer's last one.
  readonly computedAt: Date;
}

export interface TrendPoint {
  // A string, not a `Date`: `date_trunc` and `toYYYYMM` return different shapes, so each
  // adapter normalises here.
  readonly period: string;
  readonly value: number;
}

// Aggregate reads over time — the questions a dashboard asks, not the ones a screen
// asks. Read-only by construction: a write method makes a derived store authoritative.
export abstract class AnalyticsReader {
  // The caller's already-resolved permitted scope: an analytics store has no
  // `CapabilitySet` and no join back to goal membership.
  public abstract goalRiskScores(goalIds: readonly GoalId[]): Promise<readonly RiskScore[]>;

  public abstract reliabilityTrend(
    userId: UserId,
    goalIds: readonly GoalId[],
    window: DateRange,
  ): Promise<readonly TrendPoint[]>;
}

import type {
  AnalyticsReader,
  DateRange,
  GoalId,
  RiskScore,
  TrendPoint,
  UserId,
} from "../import.js";
import type { ClickHouseConnection } from "./clickhouse.connection.js";

// The other half of the swap: same port, same two questions, and `Container` picks one.
// See docs/reference/clickhouse.md.
export class ClickHouseAnalyticsReader implements AnalyticsReader {
  public constructor(private readonly connection: ClickHouseConnection) {}

  // Already resolved by `capabilities.goalsWith()`: this store has no join back to goal
  // membership, so the permission filter is a predicate on the input set.
  public async goalRiskScores(goalIds: readonly GoalId[]): Promise<readonly RiskScore[]> {
    if (goalIds.length === 0) return [];

    const rows = await this.connection.query<{
      readonly goal_id: string;
      readonly score: number;
      readonly computed_at: string;
    }>(
      `
      SELECT
        goal_id,
        argMax(score, period)      AS score,
        toString(max(computed_at)) AS computed_at
      FROM ${this.connection.qualified("goal_risk_daily")}
      WHERE goal_id IN {goalIds:Array(String)}
      GROUP BY goal_id
    `,
      { goalIds },
    );

    return rows.map((row) => ({
      goalId: row.goal_id as GoalId,
      score: row.score,
      computedAt: new Date(`${row.computed_at.replace(" ", "T")}Z`),
    }));
  }

  // Recomputed from the components, never averaged from the ratios: the mean of per-goal
  // ratios is not the ratio across goals, and `avg(score)` looks obvious here.
  public async reliabilityTrend(
    userId: UserId,
    goalIds: readonly GoalId[],
    window: DateRange,
  ): Promise<readonly TrendPoint[]> {
    if (goalIds.length === 0) return [];

    return this.connection.query<TrendPoint>(
      `
      SELECT
        formatDateTime(period, '%Y-%m-%d')                       AS period,
        sum(commitments_met) / nullIf(sum(commitments_total), 0)  AS value
      FROM ${this.connection.qualified("user_reliability_daily")}
      WHERE user_id = {userId:String}
        AND goal_id IN {goalIds:Array(String)}
        AND period >= {from:Date}
        AND period <  {to:Date}
      GROUP BY period
      ORDER BY period
    `,
      {
        userId,
        goalIds,
        from: ClickHouseAnalyticsReader.isoDate(window.from),
        to: ClickHouseAnalyticsReader.isoDate(window.to),
      },
    );
  }

  // `YYYY-MM-DD`, which the port returns and a ClickHouse `Date` parameter parses:
  // `date_trunc` and `formatDateTime` differ, so each adapter normalises here.
  private static isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

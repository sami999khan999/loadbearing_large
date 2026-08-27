import type {
  AnalyticsReader,
  DateRange,
  GoalId,
  RiskScore,
  TrendPoint,
  UserId,
} from "../import.js";
import type { ClickHouseConnection } from "./clickhouse.connection.js";

// The other half of the swap. `PgAnalyticsReader` and this class implement the same
// port over the same two questions, and `Container` picks one — which is the entire
// payoff of having built the seam before there was a second implementation.
//
// The two are not required to store the same rows. Postgres answers from the nightly
// rollup tables; this answers from rollups the projection maintains in ClickHouse,
// and the aggregation happens at read time because that is what a column store is for.
export class ClickHouseAnalyticsReader implements AnalyticsReader {
  public constructor(private readonly connection: ClickHouseConnection) {}

  // `goalIds` arrives already resolved by `capabilities.goalsWith()`. An analytics
  // store holds every tenant's rows and has no join back to goal membership, so the
  // permission filter has to be a predicate on the input set — identical in shape and
  // reasoning to `VectorStore.search()`.
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

  // Recomputed from the stored components, never averaged from the stored ratios.
  // The mean of per-goal ratios is not the ratio across goals, and this is the
  // implementation where that is easiest to get wrong — a column store makes
  // `avg(score)` look like the obvious query.
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

  // `YYYY-MM-DD`, the shape the port returns and the shape a ClickHouse `Date`
  // parameter parses. `TrendPoint.period` is a string for exactly this reason:
  // `date_trunc` and `formatDateTime` return different shapes, so each adapter
  // normalises to one here.
  private static isoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

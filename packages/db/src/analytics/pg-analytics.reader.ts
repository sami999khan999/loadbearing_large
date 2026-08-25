import {
  type AnalyticsReader,
  and,
  type DateRange,
  desc,
  eq,
  type GoalId,
  gte,
  inArray,
  lt,
  type RiskScore,
  sql,
  type TrendPoint,
} from "../import.js";
import { BaseRepository } from "../primitive/index.js";
import { goalRiskDaily, userReliabilityDaily } from "../schema/index.js";

// `YYYY-MM-DD`, the shape both rollup tables store and the port returns.
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

export class PgAnalyticsReader extends BaseRepository implements AnalyticsReader {
  // The latest row per goal. `selectDistinctOn` is one index scan — no window
  // function and no correlated subquery.
  public async goalRiskScores(goalIds: readonly GoalId[]): Promise<readonly RiskScore[]> {
    if (goalIds.length === 0) return [];

    return this.db
      .selectDistinctOn([goalRiskDaily.goalId], {
        goalId: goalRiskDaily.goalId,
        score: goalRiskDaily.score,
        computedAt: goalRiskDaily.computedAt,
      })
      .from(goalRiskDaily)
      .where(inArray(goalRiskDaily.goalId, goalIds))
      .orderBy(goalRiskDaily.goalId, desc(goalRiskDaily.period));
  }

  // Recomputed from the stored components, never averaged from the stored ratios —
  // the mean of per-goal ratios is not the ratio across goals.
  public async reliabilityTrend(
    userId: string,
    goalIds: readonly GoalId[],
    window: DateRange,
  ): Promise<readonly TrendPoint[]> {
    if (goalIds.length === 0) return [];

    return this.db
      .select({
        period: userReliabilityDaily.period,
        value: sql<number>`
          coalesce(
            sum(${userReliabilityDaily.commitmentsMet})::real
              / nullif(sum(${userReliabilityDaily.commitmentsTotal}), 0),
            0
          )`.as("value"),
      })
      .from(userReliabilityDaily)
      .where(
        and(
          eq(userReliabilityDaily.userId, userId),
          inArray(userReliabilityDaily.goalId, goalIds),
          gte(userReliabilityDaily.period, isoDate(window.from)),
          lt(userReliabilityDaily.period, isoDate(window.to)),
        ),
      )
      .groupBy(userReliabilityDaily.period)
      .orderBy(userReliabilityDaily.period);
  }
}

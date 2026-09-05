import {
  AnalyticsReader,
  type DateRange,
  type GoalId,
  type RiskScore,
  type TrendPoint,
  type UserId,
} from "../import.js";

// Empty arrays are enough: adding a port shows up here as one line rather than a compile
// error in forty specs. A test needing numbers passes them to the constructor.
export class StubAnalyticsReader extends AnalyticsReader {
  public constructor(
    private readonly scores: readonly RiskScore[] = [],
    private readonly trend: readonly TrendPoint[] = [],
  ) {
    super();
  }

  public override goalRiskScores(goalIds: readonly GoalId[]): Promise<readonly RiskScore[]> {
    return Promise.resolve(this.scores.filter((score) => goalIds.includes(score.goalId)));
  }

  public override reliabilityTrend(
    _userId: UserId,
    _goalIds: readonly GoalId[],
    _window: DateRange,
  ): Promise<readonly TrendPoint[]> {
    return Promise.resolve(this.trend);
  }
}

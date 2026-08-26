import {
  AnalyticsReader,
  type DateRange,
  type GoalId,
  type RiskScore,
  type TrendPoint,
  type UserId,
} from "../import.js";

// Returns empty arrays, and that is enough. The point of this file is that adding a
// port to `application` shows up here as one line rather than as a compile error in
// forty specs — a test that needs real numbers passes them to the constructor.
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

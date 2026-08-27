import { ActivityArchiveGateway, type ArchivedPartition } from "../import.js";

// Records the periods it was asked for. The real gateway detaches and drops a
// partition, so a test that used it would destroy the fixture it was asserting on.
export class RecordingActivityArchiveGateway extends ActivityArchiveGateway {
  private readonly periods: Date[] = [];

  public override archive(period: Date): Promise<ArchivedPartition> {
    this.periods.push(period);

    return Promise.resolve({
      period: period.toISOString().slice(0, 10),
      key: `fake-archive/${period.toISOString().slice(0, 7)}`,
      rowCount: 0,
    });
  }

  public archived(): readonly Date[] {
    return this.periods;
  }
}

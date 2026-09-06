import { MaintenanceGateway, type SweepOutcome } from "../import.js";

// Records rather than counts, for the same reason `RecordingActivityLogger` does: the
// assertion worth writing is "the sweep ran with this clock", not "the sweep ran".
export class RecordingMaintenanceGateway extends MaintenanceGateway {
  private readonly sweeps: Date[] = [];
  private readonly partitionRuns: { from: Date; monthsAhead: number }[] = [];

  public constructor(private readonly outcome: SweepOutcome = { sessions: 0, verifications: 0 }) {
    super();
  }

  public override sweepExpired(now: Date): Promise<SweepOutcome> {
    this.sweeps.push(now);
    return Promise.resolve(this.outcome);
  }

  public override ensureActivityPartitions(
    from: Date,
    monthsAhead: number,
  ): Promise<readonly string[]> {
    this.partitionRuns.push({ from, monthsAhead });
    return Promise.resolve([]);
  }

  public swept(): readonly Date[] {
    return this.sweeps;
  }

  public partitionsEnsured(): readonly { from: Date; monthsAhead: number }[] {
    return this.partitionRuns;
  }
}

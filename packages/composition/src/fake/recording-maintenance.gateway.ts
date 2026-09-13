import { MaintenanceGateway, type PartitionedTableName, type SweepOutcome } from "../import.js";

export interface EnsuredPartitions {
  readonly table: PartitionedTableName;
  readonly from: Date;
  readonly months: number;
}

export interface DroppedPartitions {
  readonly table: PartitionedTableName;
  readonly cutoff: Date;
}

// Records rather than counts, for the same reason `RecordingActivityLogger` does: the
// assertion worth writing is "the sweep ran with this clock", not "the sweep ran".
export class RecordingMaintenanceGateway extends MaintenanceGateway {
  private readonly sweeps: Date[] = [];
  private readonly partitionRuns: EnsuredPartitions[] = [];
  private readonly dropRuns: DroppedPartitions[] = [];

  public constructor(
    private readonly outcome: SweepOutcome = { sessions: 0, verifications: 0, invitations: 0 },
  ) {
    super();
  }

  public override sweepExpired(now: Date): Promise<SweepOutcome> {
    this.sweeps.push(now);
    return Promise.resolve(this.outcome);
  }

  public override ensureMonthlyPartitions(
    table: PartitionedTableName,
    from: Date,
    months: number,
  ): Promise<readonly string[]> {
    this.partitionRuns.push({ table, from, months });
    return Promise.resolve([]);
  }

  public override dropMonthlyPartitionsBefore(
    table: PartitionedTableName,
    cutoff: Date,
  ): Promise<readonly string[]> {
    this.dropRuns.push({ table, cutoff });
    return Promise.resolve([]);
  }

  public swept(): readonly Date[] {
    return this.sweeps;
  }

  public partitionsEnsured(): readonly EnsuredPartitions[] {
    return this.partitionRuns;
  }

  public partitionsDropped(): readonly DroppedPartitions[] {
    return this.dropRuns;
  }
}

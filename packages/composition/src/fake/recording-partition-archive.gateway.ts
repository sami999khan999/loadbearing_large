import {
  type ArchivedObject,
  type ArchivedPartition,
  type OrganizationId,
  PartitionArchiveGateway,
  type PartitionedTableName,
  type RestoredMonth,
} from "../import.js";

export interface ArchiveRequest {
  readonly table: PartitionedTableName;
  readonly period: Date;
}

export interface RestoreRequest extends ArchiveRequest {
  readonly organizationId: OrganizationId;
}

// Records what it was asked for. The real gateway detaches and drops a partition, so a
// test that used it would destroy the fixture it was asserting on.
export class RecordingPartitionArchiveGateway extends PartitionArchiveGateway {
  private readonly requests: ArchiveRequest[] = [];
  private readonly restores: RestoreRequest[] = [];
  private readonly stamps: RestoreRequest[] = [];
  private readonly sweeps: OrganizationId[] = [];

  // What every `archive` call reports it wrote. Empty by default, so a spec that is not
  // about the objects does not have to invent any.
  public constructor(private readonly objects: readonly ArchivedObject[] = []) {
    super();
  }

  public override archive(table: PartitionedTableName, period: Date): Promise<ArchivedPartition> {
    this.requests.push({ table, period });

    // `dropped` is derived from the objects rather than given: the real gateway drops
    // exactly what it archived, and a fake that could disagree would hide a bug there.
    return Promise.resolve({
      table,
      period: period.toISOString().slice(0, 10),
      objects: this.objects,
      dropped: this.objects.map((object) => `${table}_${object.organizationId}`),
    });
  }

  public override restore(
    table: PartitionedTableName,
    period: Date,
    organizationId: OrganizationId,
  ): Promise<RestoredMonth> {
    this.restores.push({ table, period, organizationId });

    return Promise.resolve({
      table,
      period: period.toISOString().slice(0, 10),
      organizationId,
      scratchTable: `${table}_restore`,
      rowCount: 0,
    });
  }

  public override markProjected(
    table: PartitionedTableName,
    period: Date,
    organizationId: OrganizationId,
  ): Promise<void> {
    this.stamps.push({ table, period, organizationId });
    return Promise.resolve();
  }

  public override sweep(organizationId: OrganizationId): Promise<number> {
    this.sweeps.push(organizationId);
    return Promise.resolve(0);
  }

  public archived(): readonly ArchiveRequest[] {
    return this.requests;
  }

  public restored(): readonly RestoreRequest[] {
    return this.restores;
  }

  public projected(): readonly RestoreRequest[] {
    return this.stamps;
  }

  public swept(): readonly OrganizationId[] {
    return this.sweeps;
  }
}

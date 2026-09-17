import { ActivityArchiveGateway, type ArchivedPartition, type OrganizationId } from "../import.js";

export interface ArchiveRequest {
  readonly organizationId: OrganizationId;
  readonly period: Date;
}

// Records what it was asked for. The real gateway detaches and drops a partition, so a
// test that used it would destroy the fixture it was asserting on.
export class RecordingActivityArchiveGateway extends ActivityArchiveGateway {
  private readonly requests: ArchiveRequest[] = [];

  public override archive(
    organizationId: OrganizationId,
    period: Date,
  ): Promise<ArchivedPartition> {
    this.requests.push({ organizationId, period });

    return Promise.resolve({
      organizationId,
      period: period.toISOString().slice(0, 10),
      key: `fake-archive/${period.toISOString().slice(0, 7)}/${organizationId}`,
      rowCount: 0,
    });
  }

  public archived(): readonly ArchiveRequest[] {
    return this.requests;
  }
}

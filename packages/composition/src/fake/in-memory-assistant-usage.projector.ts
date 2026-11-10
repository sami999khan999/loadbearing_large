import {
  AssistantUsageProjector,
  type AssistantUsageRecord,
  type OrganizationId,
  type ProjectionCheckpoint,
} from "../import.js";

// Keyed on the usage id, like the real `ReplacingMergeTree`, and its checkpoint is read
// back from the rows, so a test cannot pass on a cursor the real store does not have.
export class InMemoryAssistantUsageProjector extends AssistantUsageProjector {
  private readonly rows = new Map<string, AssistantUsageRecord>();

  public projected(): readonly AssistantUsageRecord[] {
    return [...this.rows.values()];
  }

  public override checkpoint(organizationId: OrganizationId): Promise<ProjectionCheckpoint> {
    const last = this.projected()
      .filter((row) => row.organizationId === organizationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .at(-1);

    return Promise.resolve(
      last
        ? { lastOccurredAt: last.createdAt, lastId: last.id }
        : { lastOccurredAt: null, lastId: null },
    );
  }

  public override project(records: readonly AssistantUsageRecord[]): Promise<number> {
    for (const record of records) this.rows.set(record.id, record);
    return Promise.resolve(records.length);
  }

  public override deleteTenant(organizationId: OrganizationId): Promise<void> {
    for (const [id, row] of this.rows)
      if (row.organizationId === organizationId) this.rows.delete(id);
    return Promise.resolve();
  }
}

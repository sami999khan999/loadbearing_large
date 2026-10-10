import { type WorkerQueueSettingsRecord, WorkerQueueSettingsRepository } from "../import.js";

export class InMemoryWorkerQueueSettingsRepository extends WorkerQueueSettingsRepository {
  public readonly rows = new Map<string, WorkerQueueSettingsRecord>();

  public constructor(rows: readonly WorkerQueueSettingsRecord[] = []) {
    super();
    for (const row of rows) this.rows.set(row.queue, row);
  }

  public override all(): Promise<readonly WorkerQueueSettingsRecord[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  public override save(record: WorkerQueueSettingsRecord): Promise<void> {
    this.rows.set(record.queue, record);
    return Promise.resolve();
  }
}

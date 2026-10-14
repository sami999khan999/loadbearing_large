import type {
  Placement,
  WorkerQueueSettingsRecord,
  WorkerQueueSettingsRepository,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { workerQueueSettings } from "../schema/index.js";

export class PgWorkerQueueSettingsRepository
  extends BaseRepository
  implements WorkerQueueSettingsRepository
{
  // Deployment-wide: every worker reads it on its tick, before it knows any tenant.
  protected override readonly placement: Placement = "catalog";

  public async all(): Promise<readonly WorkerQueueSettingsRecord[]> {
    return this.db
      .select({
        queue: workerQueueSettings.queue,
        paused: workerQueueSettings.paused,
        autoscaleEnabled: workerQueueSettings.autoscaleEnabled,
        concurrencyMin: workerQueueSettings.concurrencyMin,
        concurrencyMax: workerQueueSettings.concurrencyMax,
        scaleUpWaiting: workerQueueSettings.scaleUpWaiting,
        step: workerQueueSettings.step,
        scaleDownAfterSeconds: workerQueueSettings.scaleDownAfterSeconds,
      })
      .from(workerQueueSettings);
  }

  public async save(record: WorkerQueueSettingsRecord): Promise<void> {
    const { queue, ...rest } = record;
    await this.db
      .insert(workerQueueSettings)
      .values({ ...record, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: workerQueueSettings.queue,
        set: { ...rest, updatedAt: new Date() },
      });
  }
}

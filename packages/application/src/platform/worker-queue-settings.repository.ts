// One queue's cluster-wide settings. An absent row is a queue that is not paused and
// runs at each process's `WORKER_<Q>_CONCURRENCY`, the deploy before the table existed.
export interface WorkerQueueSettingsRecord {
  readonly queue: string;
  readonly paused: boolean;
  // Off means the environment's starting concurrency, and the four numbers below are kept
  // but not read, so switching it back on restores what was saved.
  readonly autoscaleEnabled: boolean;
  readonly concurrencyMin: number;
  readonly concurrencyMax: number;
  // Add capacity when this many jobs are waiting.
  readonly scaleUpWaiting: number;
  readonly step: number;
  // Remove capacity after the queue has been empty this long.
  readonly scaleDownAfterSeconds: number;
}

export abstract class WorkerQueueSettingsRepository {
  public abstract all(): Promise<readonly WorkerQueueSettingsRecord[]>;

  public abstract save(record: WorkerQueueSettingsRecord): Promise<void>;
}

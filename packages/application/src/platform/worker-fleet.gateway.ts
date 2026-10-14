// One queue served inside one worker process, as that process last reported it.
export interface WorkerLaneReport {
  readonly queue: string;
  readonly concurrency: number;
  readonly active: number;
  readonly paused: boolean;
}

// One live worker process. Written by the process itself on every heartbeat, so a
// process that stops reporting drops out of `list()` once its entry expires.
export interface WorkerProcessReport {
  readonly id: string;
  readonly host: string;
  readonly startedAt: Date;
  readonly heartbeatAt: Date;
  readonly paused: boolean;
  // True while the dashboard's queue list replaces the process's `WORKER_QUEUES`.
  readonly overridden: boolean;
  readonly lanes: readonly WorkerLaneReport[];
}

// What the dashboard has set on one process. They die with the process: a restart is
// back on its own environment, which is what an operator restarting it expects.
export interface WorkerProcessOverrides {
  readonly paused: boolean;
  readonly pausedQueues: readonly string[];
  // Null serves `WORKER_QUEUES`. Never empty: an empty list is refused upstream.
  readonly queues: readonly string[] | null;
}

// The live registry of worker processes and the channel that tells them to re-read it.
// Both halves are here because both sit on the queue instance, which never evicts.
export abstract class WorkerFleetGateway {
  public abstract list(): Promise<readonly WorkerProcessReport[]>;

  // The defaults when nothing has been set, never null.
  public abstract overrides(processId: string): Promise<WorkerProcessOverrides>;

  public abstract saveOverrides(
    processId: string,
    overrides: WorkerProcessOverrides,
  ): Promise<void>;

  public abstract clearOverrides(processId: string): Promise<void>;

  // `all`, or one process id. A process that misses it catches up on its next tick.
  public abstract signal(target: string): Promise<void>;

  public abstract heartbeat(report: WorkerProcessReport, ttlSeconds: number): Promise<void>;

  public abstract remove(processId: string): Promise<void>;

  // Resolves once subscribed; the returned function unsubscribes.
  public abstract listen(onSignal: (target: string) => void): Promise<() => Promise<void>>;
}

import {
  WorkerFleetGateway,
  type WorkerProcessOverrides,
  type WorkerProcessReport,
} from "../import.js";

const NO_OVERRIDES: WorkerProcessOverrides = Object.freeze({
  paused: false,
  pausedQueues: Object.freeze([]),
  queues: null,
});

// Heartbeats, overrides and signals held in maps, with `listen` wired to `signal` so
// two supervisors built over one fake hear each other the way two processes do.
export class InMemoryWorkerFleetGateway extends WorkerFleetGateway {
  public readonly processes = new Map<string, WorkerProcessReport>();
  public readonly saved = new Map<string, WorkerProcessOverrides>();
  public readonly signals: string[] = [];
  private readonly listeners = new Set<(target: string) => void>();

  public override list(): Promise<readonly WorkerProcessReport[]> {
    return Promise.resolve([...this.processes.values()]);
  }

  public override overrides(processId: string): Promise<WorkerProcessOverrides> {
    return Promise.resolve(this.saved.get(processId) ?? NO_OVERRIDES);
  }

  public override saveOverrides(
    processId: string,
    overrides: WorkerProcessOverrides,
  ): Promise<void> {
    this.saved.set(processId, overrides);
    return Promise.resolve();
  }

  public override clearOverrides(processId: string): Promise<void> {
    this.saved.delete(processId);
    return Promise.resolve();
  }

  public override signal(target: string): Promise<void> {
    this.signals.push(target);
    for (const listener of this.listeners) listener(target);
    return Promise.resolve();
  }

  public override heartbeat(report: WorkerProcessReport): Promise<void> {
    this.processes.set(report.id, report);
    return Promise.resolve();
  }

  public override remove(processId: string): Promise<void> {
    this.processes.delete(processId);
    this.saved.delete(processId);
    return Promise.resolve();
  }

  public override listen(onSignal: (target: string) => void): Promise<() => Promise<void>> {
    this.listeners.add(onSignal);
    return Promise.resolve(() => {
      this.listeners.delete(onSignal);
      return Promise.resolve();
    });
  }
}

import {
  type Container,
  type QueueKey,
  QueueLimits,
  type Worker,
  WorkerAutoscaleRules,
  type WorkerLaneReport,
  type WorkerQueueSettingsRecord,
} from "../import.js";
import type { LaneFactory, LaneRegistry } from "./lane-registry.js";

// The fallback when a control message is missed. A signal applies a change within a
// second; this is how long a process that missed one runs on stale state.
const TICK_MS = 5_000;
// Three missed ticks, so a process mid-GC is not dropped from the page.
const HEARTBEAT_TTL_SECONDS = 15;

export interface SupervisorIdentity {
  readonly id: string;
  readonly host: string;
  readonly startedAt: Date;
}

interface Lane {
  readonly factory: LaneFactory;
  readonly worker: Worker;
  active: number;
  lastChangeMs: number;
  idleSinceMs: number | null;
}

// Owns the lanes one worker process runs and reconciles them with the dashboard: which
// queues, paused or not, and at what concurrency. See docs/reference/supervisor.md.
export class WorkerSupervisor {
  private readonly lanes = new Map<QueueKey, Lane>();
  private readonly closing = new Set<Promise<void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private unlisten: (() => Promise<void>) | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;

  public constructor(
    private readonly registry: LaneRegistry,
    private readonly container: Container,
    private readonly identity: SupervisorIdentity,
    private readonly processMaxConcurrency: number,
    private readonly envQueues: readonly string[] | undefined,
  ) {}

  public get workers(): readonly Worker[] {
    return [...this.lanes.values()].map((lane) => lane.worker);
  }

  // The environment is checked strictly and before the first lane starts: a refusal
  // halfway would leave a process consuming some queues and exiting on the rest.
  public async start(): Promise<void> {
    const selected = this.registry.select(this.envQueues);
    WorkerSupervisor.assertCeilings(selected, this.processMaxConcurrency);

    for (const factory of selected) this.open(factory, factory.concurrency);

    await this.applyQueuePauses();
    await this.reconcile();

    this.unlisten = await this.container.workerFleet.listen((target) => {
      if (target === "all" || target === this.identity.id) void this.reconcile();
    });
    this.timer = setInterval(() => void this.reconcile(), TICK_MS);
    this.timer.unref();
  }

  // One pass at a time. A signal arriving mid-pass queues exactly one more, so a burst of
  // dashboard clicks costs two passes, not one per click.
  public reconcile(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }

    this.running = this.pass()
      .catch((error: unknown) => {
        this.container.logger.emit("worker.reconcile.failed", { processId: this.identity.id });
        this.container.logger.failure(error, { processId: this.identity.id, phase: "reconcile" });
      })
      .finally(() => {
        this.running = null;
        if (this.again && !this.stopped) {
          this.again = false;
          void this.reconcile();
        }
      });
    return this.running;
  }

  public async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;

    try {
      await this.unlisten?.();
      await this.container.workerFleet.remove(this.identity.id);
    } catch (error: unknown) {
      this.container.logger.failure(error, { processId: this.identity.id, phase: "deregister" });
    }

    // `close()` waits for each lane's active jobs. The caller races it against the
    // shutdown timeout; see docs/reference/shutdown.md.
    await Promise.all([
      ...[...this.lanes.values()].map((lane) => lane.worker.close()),
      ...this.closing,
    ]);
  }

  private async pass(): Promise<void> {
    if (this.stopped) return;

    const fleet = this.container.workerFleet;
    const [overrides, rows] = await Promise.all([
      fleet.overrides(this.identity.id),
      this.container.workerQueueSettings.all(),
    ]);

    const wanted = this.registry.available(overrides.queues ?? this.envQueues);
    for (const [queue, lane] of this.lanes) {
      if (!wanted.some((factory) => factory.queue === queue)) this.shut(queue, lane);
    }
    for (const factory of wanted) {
      if (!this.lanes.has(factory.queue)) this.openWithinCeiling(factory);
    }

    for (const [queue, lane] of this.lanes) {
      this.applyPause(queue, lane, overrides.paused || overrides.pausedQueues.includes(queue));
    }

    await this.autoscale(rows);

    await fleet.heartbeat(
      {
        ...this.identity,
        heartbeatAt: this.container.clock.now(),
        paused: overrides.paused,
        overridden: overrides.queues !== null,
        lanes: this.reports(),
      },
      HEARTBEAT_TTL_SECONDS,
    );
  }

  private async autoscale(rows: readonly WorkerQueueSettingsRecord[]): Promise<void> {
    if (this.lanes.size === 0) return;

    const counts = await this.container.queueControl.counts([...this.lanes.keys()]);
    const now = this.container.clock.now().getTime();

    for (const [queue, lane] of this.lanes) {
      const count = counts.find((entry) => entry.queue === queue);
      const waiting = count?.waiting ?? 0;
      if (waiting === 0) lane.idleSinceMs ??= now;
      else lane.idleSinceMs = null;

      // A paused queue's backlog is not demand: scaling it up would only hand the burst
      // more capacity the moment it resumes.
      if (count?.paused || lane.worker.isPaused()) continue;

      const current = lane.worker.concurrency;
      const next = WorkerAutoscaleRules.next({
        current,
        start: lane.factory.concurrency,
        settings: rows.find((row) => row.queue === queue) ?? null,
        limit: QueueLimits.maxFor(queue),
        headroom: this.processMaxConcurrency - this.total(),
        waiting,
        nowMs: now,
        lastChangeMs: lane.lastChangeMs,
        idleSinceMs: lane.idleSinceMs,
      });
      if (next === current) continue;

      lane.worker.concurrency = next;
      lane.lastChangeMs = now;
      this.container.logger.emit("worker.autoscale.changed", {
        processId: this.identity.id,
        queue,
        from: current,
        to: next,
        waiting,
      });
    }
  }

  // BullMQ's global pause lives in Redis and survives restarts. The row is the decision,
  // so a process booting after a Redis migration copies the row back onto the queue.
  private async applyQueuePauses(): Promise<void> {
    const rows = await this.container.workerQueueSettings.all();
    const counts = await this.container.queueControl.counts([...this.lanes.keys()]);

    for (const row of rows) {
      const count = counts.find((entry) => entry.queue === row.queue);
      if (!count || count.paused === row.paused) continue;
      if (row.paused) await this.container.queueControl.pause(row.queue);
      else await this.container.queueControl.resume(row.queue);
    }
  }

  private applyPause(queue: QueueKey, lane: Lane, paused: boolean): void {
    if (paused === lane.worker.isPaused()) return;

    // `true`: do not wait for active jobs. They finish on their own; the pass must not
    // block on a slow job before it can apply the next change.
    if (paused) void lane.worker.pause(true);
    else lane.worker.resume();

    const fields = { processId: this.identity.id, queue };
    if (paused) this.container.logger.emit("worker.process.paused", fields);
    else this.container.logger.emit("worker.process.resumed", fields);
  }

  // A lane the dashboard adds starts at its env value, cut to what the process ceiling
  // leaves. With nothing left it is not started, and the failure says why.
  private openWithinCeiling(factory: LaneFactory): void {
    const room = this.processMaxConcurrency - this.total();
    if (room < 1) {
      this.container.logger.failure(new Error("no concurrency left for the lane"), {
        processId: this.identity.id,
        queue: factory.queue,
        processMaxConcurrency: this.processMaxConcurrency,
      });
      return;
    }
    this.open(factory, Math.min(factory.concurrency, room));
  }

  private open(factory: LaneFactory, concurrency: number): void {
    const worker = factory.start();
    if (worker.concurrency !== concurrency) worker.concurrency = concurrency;

    const lane: Lane = { factory, worker, active: 0, lastChangeMs: 0, idleSinceMs: null };
    worker.on("active", () => {
      lane.active += 1;
    });
    const settled = (): void => {
      lane.active = Math.max(0, lane.active - 1);
    };
    worker.on("completed", settled);
    worker.on("failed", settled);

    this.lanes.set(factory.queue, lane);
    this.container.logger.emit("worker.lane.started", {
      processId: this.identity.id,
      queue: factory.queue,
      concurrency,
    });
  }

  // Graceful: `close()` lets active jobs finish. Tracked, so a drain that starts while a
  // lane is still closing waits for it too.
  private shut(queue: QueueKey, lane: Lane): void {
    this.lanes.delete(queue);
    const closed = lane.worker.close().then(
      () => {
        this.container.logger.emit("worker.lane.stopped", { processId: this.identity.id, queue });
      },
      (error: unknown) => {
        this.container.logger.failure(error, { processId: this.identity.id, queue });
      },
    );
    this.closing.add(closed);
    void closed.finally(() => this.closing.delete(closed));
  }

  private total(): number {
    let sum = 0;
    for (const lane of this.lanes.values()) sum += lane.worker.concurrency;
    return sum;
  }

  private reports(): readonly WorkerLaneReport[] {
    return [...this.lanes.entries()].map(([queue, lane]) => ({
      queue,
      concurrency: lane.worker.concurrency,
      active: lane.active,
      paused: lane.worker.isPaused(),
    }));
  }

  private static assertCeilings(selected: readonly LaneFactory[], processMax: number): void {
    if (selected.length === 0) {
      throw new Error("WORKER_QUEUES selects no queue. Name at least one, or unset it.");
    }

    for (const lane of selected) {
      const max = QueueLimits.maxFor(lane.queue);
      if (lane.concurrency > max) {
        throw new Error(
          `${lane.variable}=${lane.concurrency} is above the ${lane.queue} queue's limit of ${max}.`,
        );
      }
    }

    const total = selected.reduce((sum, lane) => sum + lane.concurrency, 0);
    if (total > processMax) {
      const variables = selected.map((lane) => `${lane.variable}=${lane.concurrency}`).join(", ");
      throw new Error(
        `These lanes add up to ${total}, above WORKER_PROCESS_MAX_CONCURRENCY=${processMax}. Lower one of ${variables}, or split the queues across services with WORKER_QUEUES.`,
      );
    }
  }
}

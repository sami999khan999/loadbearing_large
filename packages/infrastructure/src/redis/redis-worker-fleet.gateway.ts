import type {
  Redis,
  WorkerFleetGateway,
  WorkerProcessOverrides,
  WorkerProcessReport,
} from "../import.js";

const PROCESSES = "worker:procs";
const CHANNEL = "worker:control";
const processKey = (id: string): string => `worker:proc:${id}`;
const overridesKey = (id: string): string => `worker:proc:${id}:overrides`;

// Outlives several missed heartbeats, so a process mid-GC keeps its overrides, and still
// dies with it: a restarted process is back on its own environment.
const OVERRIDES_TTL_SECONDS = 60;

const NO_OVERRIDES: WorkerProcessOverrides = Object.freeze({
  paused: false,
  pausedQueues: Object.freeze([]),
  queues: null,
});

type StoredReport = Omit<WorkerProcessReport, "startedAt" | "heartbeatAt"> & {
  readonly startedAt: string;
  readonly heartbeatAt: string;
};

// On the queue instance, never the cache: it is `noeviction`, and an evicted override is
// a paused process that silently resumes. See apps/worker/docs/reference/supervisor.md.
export class RedisWorkerFleetGateway implements WorkerFleetGateway {
  public constructor(private readonly redis: Redis) {}

  public async list(): Promise<readonly WorkerProcessReport[]> {
    const ids = await this.redis.zrange(PROCESSES, 0, -1);
    if (ids.length === 0) return [];

    const raw = await this.redis.mget(...ids.map(processKey));
    const reports: WorkerProcessReport[] = [];
    const expired: string[] = [];

    raw.forEach((value, index) => {
      const id = ids[index];
      if (id === undefined) return;
      if (value === null) {
        expired.push(id);
        return;
      }
      const stored = JSON.parse(value) as StoredReport;
      reports.push({
        ...stored,
        startedAt: new Date(stored.startedAt),
        heartbeatAt: new Date(stored.heartbeatAt),
      });
    });

    // The index is pruned on read: a process killed without a drain never removes itself.
    if (expired.length > 0) await this.redis.zrem(PROCESSES, ...expired);
    return reports;
  }

  public async overrides(processId: string): Promise<WorkerProcessOverrides> {
    const value = await this.redis.get(overridesKey(processId));
    return value === null ? NO_OVERRIDES : (JSON.parse(value) as WorkerProcessOverrides);
  }

  public async saveOverrides(processId: string, overrides: WorkerProcessOverrides): Promise<void> {
    await this.redis.set(
      overridesKey(processId),
      JSON.stringify(overrides),
      "EX",
      OVERRIDES_TTL_SECONDS,
    );
  }

  public async clearOverrides(processId: string): Promise<void> {
    await this.redis.del(overridesKey(processId));
  }

  public async signal(target: string): Promise<void> {
    await this.redis.publish(CHANNEL, target);
  }

  public async heartbeat(report: WorkerProcessReport, ttlSeconds: number): Promise<void> {
    const stored: StoredReport = {
      ...report,
      startedAt: report.startedAt.toISOString(),
      heartbeatAt: report.heartbeatAt.toISOString(),
    };
    await this.redis
      .multi()
      .set(processKey(report.id), JSON.stringify(stored), "EX", ttlSeconds)
      .zadd(PROCESSES, report.heartbeatAt.getTime(), report.id)
      .expire(overridesKey(report.id), OVERRIDES_TTL_SECONDS)
      .exec();
  }

  public async remove(processId: string): Promise<void> {
    await this.redis
      .multi()
      .del(processKey(processId), overridesKey(processId))
      .zrem(PROCESSES, processId)
      .exec();
  }

  // Its own connection: one in subscriber mode can run nothing else, and the shared
  // queue client is what every BullMQ worker in the process blocks on.
  public async listen(onSignal: (target: string) => void): Promise<() => Promise<void>> {
    const subscriber = this.redis.duplicate();
    subscriber.on("message", (channel: string, message: string) => {
      if (channel === CHANNEL) onSignal(message);
    });
    await subscriber.subscribe(CHANNEL);

    return async () => {
      await subscriber.quit();
    };
  }
}

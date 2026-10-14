import type { Authorizer, Principal } from "../primitive/index.js";
import { QueueLimits } from "../primitive/index.js";
import type { QueueControlGateway, QueueCounts } from "./queue-control.gateway.js";
import type { WorkerFleetGateway, WorkerProcessReport } from "./worker-fleet.gateway.js";
import type {
  WorkerQueueSettingsRecord,
  WorkerQueueSettingsRepository,
} from "./worker-queue-settings.repository.js";

export interface WorkerQueueView {
  readonly queue: string;
  readonly counts: QueueCounts;
  readonly settings: WorkerQueueSettingsRecord | null;
  readonly limit: number;
  // How many live processes run a lane for it, and their concurrency added up.
  readonly servedBy: number;
  readonly concurrency: number;
  // No live process serves it, so its jobs wait however the queue is set.
  readonly unserved: boolean;
}

export interface WorkerFleetView {
  readonly processes: readonly WorkerProcessReport[];
  readonly queues: readonly WorkerQueueView[];
}

// The Workers page in one read. `queues` is the deployment's own list: analytics only
// when it runs ClickHouse, so a queue that cannot exist is never reported unserved.
export class GetWorkerFleetUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly fleet: WorkerFleetGateway,
    private readonly control: QueueControlGateway,
    private readonly settings: WorkerQueueSettingsRepository,
    private readonly queues: readonly string[],
  ) {}

  public async execute(actor: Principal): Promise<WorkerFleetView> {
    this.authorizer.assert(actor, "platform.worker.read");

    const [processes, counts, saved] = await Promise.all([
      this.fleet.list(),
      this.control.counts(this.queues),
      this.settings.all(),
    ]);

    const queues = counts.map((count) => {
      const lanes = processes.flatMap((process) =>
        process.lanes.filter((lane) => lane.queue === count.queue),
      );
      return {
        queue: count.queue,
        counts: count,
        settings: saved.find((row) => row.queue === count.queue) ?? null,
        limit: QueueLimits.isQueue(count.queue) ? QueueLimits.maxFor(count.queue) : 1,
        servedBy: lanes.length,
        concurrency: lanes.reduce((sum, lane) => sum + lane.concurrency, 0),
        unserved: lanes.length === 0,
      };
    });

    return {
      processes: processes.toSorted((left, right) => left.id.localeCompare(right.id)),
      queues,
    };
  }
}

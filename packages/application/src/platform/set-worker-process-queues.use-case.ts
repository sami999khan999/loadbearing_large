import { NotFoundError } from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { Principal } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import { WorkerControlRules } from "./worker-control.rules.js";
import type { WorkerFleetGateway } from "./worker-fleet.gateway.js";

export interface SetWorkerProcessQueuesInput {
  readonly processId: string;
  readonly queues: readonly string[];
}

export interface WorkerQueuesChanged {
  // Queues no live process will serve once this lands. Allowed, and reported, because
  // moving a queue between two processes passes through this state on purpose.
  readonly unserved: readonly string[];
}

// Replaces the process's `WORKER_QUEUES` until it restarts or is reset. Removed lanes
// close gracefully: their active jobs finish first.
export class SetWorkerProcessQueuesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly fleet: WorkerFleetGateway,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly served: readonly string[],
  ) {}

  public async execute(
    actor: Principal,
    input: SetWorkerProcessQueuesInput,
  ): Promise<WorkerQueuesChanged> {
    this.authorizer.assert(actor, "platform.worker.manage");
    const queues = WorkerControlRules.queueList(input.queues);

    const live = await this.fleet.list();
    if (!live.some((process) => process.id === input.processId)) {
      throw new NotFoundError("worker", input.processId);
    }

    const current = await this.fleet.overrides(input.processId);
    await this.fleet.saveOverrides(input.processId, { ...current, queues });

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );
    await this.unitOfWork.run(() =>
      this.activity.record(auditor, "platform.worker.reassigned", {
        processId: input.processId,
        queues: queues.join(","),
      }),
    );

    await this.fleet.signal(input.processId);

    const others = live
      .filter((process) => process.id !== input.processId)
      .flatMap((process) => process.lanes.map((lane) => lane.queue));
    const covered = new Set<string>([...others, ...queues]);
    return { unserved: this.served.filter((queue) => !covered.has(queue)) };
  }
}

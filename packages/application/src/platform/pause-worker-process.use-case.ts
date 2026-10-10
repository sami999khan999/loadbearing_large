import { NotFoundError } from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { Principal } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import { WorkerControlRules } from "./worker-control.rules.js";
import type { WorkerFleetGateway } from "./worker-fleet.gateway.js";

export interface PauseWorkerProcessInput {
  readonly processId: string;
  readonly paused: boolean;
  // One lane on that process; absent pauses or resumes the whole process.
  readonly queue?: string;
}

// One process, or one queue on one process. Active jobs finish; nothing new starts.
// Held in that process's overrides, so a restart clears it.
export class PauseWorkerProcessUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly fleet: WorkerFleetGateway,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: PauseWorkerProcessInput): Promise<void> {
    this.authorizer.assert(actor, "platform.worker.manage");
    const queue = input.queue === undefined ? undefined : WorkerControlRules.queue(input.queue);

    const live = await this.fleet.list();
    if (!live.some((process) => process.id === input.processId)) {
      throw new NotFoundError("worker", input.processId);
    }

    const current = await this.fleet.overrides(input.processId);
    const pausedQueues = new Set(current.pausedQueues);
    if (queue !== undefined) {
      if (input.paused) pausedQueues.add(queue);
      else pausedQueues.delete(queue);
    }

    await this.fleet.saveOverrides(input.processId, {
      ...current,
      paused: queue === undefined ? input.paused : current.paused,
      pausedQueues: [...pausedQueues],
    });

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );
    await this.unitOfWork.run(() =>
      this.activity.record(
        auditor,
        input.paused ? "platform.worker.paused" : "platform.worker.resumed",
        { processId: input.processId, queue: queue ?? "all" },
      ),
    );

    await this.fleet.signal(input.processId);
  }
}

import { NotFoundError } from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { Principal } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import type { WorkerFleetGateway } from "./worker-fleet.gateway.js";

export interface ResetWorkerProcessInput {
  readonly processId: string;
}

// Back to the process's own environment: its `WORKER_QUEUES`, unpaused. Queue-wide
// pauses and autoscale settings are not the process's, and stay.
export class ResetWorkerProcessUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly fleet: WorkerFleetGateway,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: ResetWorkerProcessInput): Promise<void> {
    this.authorizer.assert(actor, "platform.worker.manage");

    const live = await this.fleet.list();
    if (!live.some((process) => process.id === input.processId)) {
      throw new NotFoundError("worker", input.processId);
    }

    await this.fleet.clearOverrides(input.processId);

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );
    await this.unitOfWork.run(() =>
      this.activity.record(auditor, "platform.worker.reset", { processId: input.processId }),
    );

    await this.fleet.signal(input.processId);
  }
}

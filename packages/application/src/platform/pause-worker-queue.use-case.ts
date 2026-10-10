import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { Principal } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import type { QueueControlGateway } from "./queue-control.gateway.js";
import { WorkerAutoscaleRules } from "./worker-autoscale.rules.js";
import { WorkerControlRules } from "./worker-control.rules.js";
import type { WorkerFleetGateway } from "./worker-fleet.gateway.js";
import type { WorkerQueueSettingsRepository } from "./worker-queue-settings.repository.js";

export interface PauseWorkerQueueInput {
  readonly queue: string;
  readonly paused: boolean;
}

// One queue, on every process. The row is the record of the decision and BullMQ's own
// pause is what stops the work; a booting process copies the first onto the second.
export class PauseWorkerQueueUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: WorkerQueueSettingsRepository,
    private readonly control: QueueControlGateway,
    private readonly fleet: WorkerFleetGateway,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: PauseWorkerQueueInput): Promise<void> {
    this.authorizer.assert(actor, "platform.worker.manage");
    const queue = WorkerControlRules.queue(input.queue);

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );

    await this.unitOfWork.run(async () => {
      const current = (await this.settings.all()).find((row) => row.queue === queue);
      await this.settings.save({
        ...WorkerAutoscaleRules.DEFAULTS,
        autoscaleEnabled: false,
        concurrencyMax: WorkerAutoscaleRules.DEFAULTS.concurrencyMin,
        ...current,
        queue,
        paused: input.paused,
      });

      await this.activity.record(
        auditor,
        input.paused ? "platform.queue.paused" : "platform.queue.resumed",
        { queue },
      );
    });

    // After the commit: a pause that rolled back must not have stopped anything.
    if (input.paused) await this.control.pause(queue);
    else await this.control.resume(queue);

    await this.fleet.signal("all");
  }
}

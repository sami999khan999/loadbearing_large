import { ValidationError } from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer } from "../primitive/index.js";
import { Principal, QueueLimits } from "../primitive/index.js";
import type { PlatformReader } from "./platform.reader.js";
import { WorkerAutoscaleRules } from "./worker-autoscale.rules.js";
import { WorkerControlRules } from "./worker-control.rules.js";
import type { WorkerFleetGateway } from "./worker-fleet.gateway.js";
import type { WorkerQueueSettingsRepository } from "./worker-queue-settings.repository.js";

export interface SaveQueueAutoscaleInput {
  readonly queue: string;
  readonly autoscaleEnabled: boolean;
  readonly concurrencyMin: number;
  readonly concurrencyMax: number;
  readonly scaleUpWaiting: number;
  readonly step: number;
  readonly scaleDownAfterSeconds: number;
}

// Concurrency inside running processes, never a process count: starting processes is
// the host's job. Every process applies the change on the signal or its next tick.
export class SaveQueueAutoscaleUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: WorkerQueueSettingsRepository,
    private readonly fleet: WorkerFleetGateway,
    private readonly platform: PlatformReader,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: SaveQueueAutoscaleInput): Promise<void> {
    this.authorizer.assert(actor, "platform.worker.manage");
    const queue = WorkerControlRules.queue(input.queue);
    SaveQueueAutoscaleUseCase.validate(input, QueueLimits.maxFor(queue));

    const auditor = new Principal(
      await this.platform.organizationId(),
      actor.userId,
      actor.capabilities,
      actor.kind,
    );

    await this.unitOfWork.run(async () => {
      const current = (await this.settings.all()).find((row) => row.queue === queue);
      await this.settings.save({ ...input, queue, paused: current?.paused ?? false });

      await this.activity.record(auditor, "platform.queue.autoscaled", {
        queue,
        autoscaleEnabled: input.autoscaleEnabled,
        concurrencyMin: input.concurrencyMin,
        concurrencyMax: input.concurrencyMax,
        scaleUpWaiting: input.scaleUpWaiting,
      });
    });

    await this.fleet.signal("all");
  }

  private static validate(input: SaveQueueAutoscaleInput, limit: number): void {
    const fields: { field: string; rule: string }[] = [];
    if (input.concurrencyMin < 1) fields.push({ field: "concurrencyMin", rule: "min" });
    if (input.concurrencyMax < input.concurrencyMin) {
      fields.push({ field: "concurrencyMax", rule: "range" });
    }
    if (input.concurrencyMax > limit) fields.push({ field: "concurrencyMax", rule: "max" });
    if (input.scaleUpWaiting < 1) fields.push({ field: "scaleUpWaiting", rule: "min" });
    if (input.step < 1) fields.push({ field: "step", rule: "min" });
    if (input.scaleDownAfterSeconds < WorkerAutoscaleRules.MIN_SCALE_DOWN_SECONDS) {
      fields.push({ field: "scaleDownAfterSeconds", rule: "min" });
    }
    if (fields.length > 0) throw new ValidationError(fields);
  }
}

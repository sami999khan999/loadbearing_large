import { ValidationError } from "../import.js";
import type { ActivityLogger, UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { NotificationSettingsRepository } from "./notification-settings.repository.js";

// The actor's own tenant only. The fan-out reads it on the next hourly run, so a change
// made at 06:50 to 07:00 takes effect the same morning.
export class UpdateDigestHourUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: NotificationSettingsRepository,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: { now(): Date },
  ) {}

  public async execute(
    actor: Principal,
    input: { readonly hour: number },
  ): Promise<{ readonly hour: number }> {
    this.authorizer.assert(actor, "notification.digest.manage");
    if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
      throw new ValidationError([{ field: "hour", rule: "range" }]);
    }

    await this.unitOfWork.run(async () => {
      await this.settings.saveDigestHour(
        actor.organizationId,
        input.hour,
        this.clock.now(),
        actor.userId,
      );
      await this.activity.record(actor, "notification.digest.rescheduled", { hour: input.hour });
    });
    return { hour: input.hour };
  }
}

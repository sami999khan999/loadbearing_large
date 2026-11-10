import type { Authorizer, Principal } from "../primitive/index.js";
import { DigestHour } from "./digest-hour.js";
import type { NotificationSettingsRepository } from "./notification-settings.repository.js";

// Anyone with an inbox may see when its digest arrives.
export class GetDigestHourUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly settings: NotificationSettingsRepository,
  ) {}

  public async execute(actor: Principal): Promise<{ readonly hour: number }> {
    this.authorizer.assert(actor, "notification.inbox.read");
    const hour = await this.settings.digestHourOf(actor.organizationId);
    return { hour: hour ?? DigestHour.DEFAULT };
  }
}

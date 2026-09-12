import type { UpdateNotificationPreferenceInput } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { NotificationPreferenceRepository } from "./notification-preference.repository.js";

export class UpdateNotificationPreferenceUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly preferences: NotificationPreferenceRepository,
  ) {}

  // Always the actor's own. There is no administrator override here: choosing how you
  // are contacted is yours, and an input carrying a userId would be the hole.
  public async execute(actor: Principal, input: UpdateNotificationPreferenceInput): Promise<void> {
    this.authorizer.assert(actor, "notification.preference.update");

    await this.preferences.save(actor.organizationId, actor.userId, input);
  }
}

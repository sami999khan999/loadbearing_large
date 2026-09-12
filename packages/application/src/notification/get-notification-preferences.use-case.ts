import type { NotificationCategory, NotificationChannel, NotificationMode } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import { NotificationPolicy } from "./notification.policy.js";
import type { NotificationPreferenceRepository } from "./notification-preference.repository.js";

export interface ResolvedPreference {
  readonly category: NotificationCategory;
  readonly channel: NotificationChannel;
  readonly mode: NotificationMode;
}

const CHANNELS: readonly NotificationChannel[] = Object.freeze(["in_app", "email"]);

export class GetNotificationPreferencesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly preferences: NotificationPreferenceRepository,
  ) {}

  // Returns the **complete** grid, not the stored rows. An absent row is the policy's
  // default, and a form rendering only what was saved shows an empty screen on day one.
  public async execute(actor: Principal): Promise<readonly ResolvedPreference[]> {
    this.authorizer.assert(actor, "notification.inbox.read");

    const stored = await this.preferences.listFor(actor.organizationId, actor.userId);
    const resolved: ResolvedPreference[] = [];

    for (const name of NotificationPolicy.events()) {
      const row = NotificationPolicy.rowFor(name);
      if (!row || resolved.some((entry) => entry.category === row.category)) continue;

      for (const channel of CHANNELS) {
        const saved = stored.find(
          (entry) => entry.category === row.category && entry.channel === channel,
        );
        resolved.push({
          category: row.category,
          channel,
          mode: saved?.mode ?? row.defaultMode[channel],
        });
      }
    }

    return resolved;
  }
}

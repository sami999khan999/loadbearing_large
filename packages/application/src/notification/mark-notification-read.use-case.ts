import type { Clock, MarkNotificationReadInput } from "../import.js";
import type { CacheStore } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import { CountUnreadNotificationsUseCase } from "./count-unread-notifications.use-case.js";
import type { NotificationRepository } from "./notification.repository.js";

export class MarkNotificationReadUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly notifications: NotificationRepository,
    private readonly cache: CacheStore,
    private readonly clock: Clock,
  ) {}

  // One row, and only the actor's own. Scoping by `(organizationId, userId)` rather than
  // by id alone is what stops a guessed id clearing somebody else's bell.
  public async execute(actor: Principal, input: MarkNotificationReadInput): Promise<void> {
    this.authorizer.assert(actor, "notification.inbox.update");

    await this.notifications.markRead(
      actor.organizationId,
      actor.userId,
      input.id,
      input.createdAt,
      this.clock.now(),
    );

    await this.cache.delete(CountUnreadNotificationsUseCase.keyFor(actor));
  }
}

import type { Clock } from "../import.js";
import { type DeleteMessageInput, ForbiddenError, NotFoundError } from "../import.js";
import type { DomainEventPublisher } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessageRecord, MessageRepository } from "./message.repository.js";
import { MessagingRules } from "./messaging.rules.js";

export class DeleteMessageUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly messages: MessageRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  public async execute(actor: Principal, input: DeleteMessageInput): Promise<void> {
    this.authorizer.assert(actor, "messaging.message.update");
    await this.access.assertMember(actor, input.conversationId);

    const existing = await this.messages.findById(
      actor.organizationId,
      input.conversationId,
      input.messageId,
      input.createdAt,
    );
    if (!existing) throw new NotFoundError("message", input.messageId);
    // Already gone is not an error: a second delete is the same intent, and a client
    // that retried one would otherwise show a failure for work that succeeded.
    if (existing.deleted) return;

    this.assertMayChange(actor, existing);

    await this.messages.softDelete(
      actor.organizationId,
      input.messageId,
      input.createdAt,
      this.clock.now(),
    );

    await this.events.publish(actor, {
      name: "message.deleted",
      payload: {
        conversationId: input.conversationId,
        messageId: input.messageId,
        createdAt: input.createdAt,
      },
    });
  }

  private assertMayChange(actor: Principal, message: MessageRecord): void {
    if (actor.can("messaging.conversation.manage")) return;

    if (message.authorId !== actor.userId) throw new ForbiddenError("messaging.message.update");
    if (!MessagingRules.withinEditWindow(message.createdAt, this.clock.now())) {
      throw new ForbiddenError("messaging.message.update");
    }
  }
}

import { type SendMessageInput, Uuid } from "../import.js";
import type { DomainEventPublisher, RealtimePublisher, UnitOfWork } from "../port/index.js";
import { type Authorizer, type Principal, RealtimeChannels } from "../primitive/index.js";
import type { ConversationRepository } from "./conversation.repository.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessageRecord, MessageRepository } from "./message.repository.js";

export class SendMessageUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly events: DomainEventPublisher,
    private readonly realtime: RealtimePublisher,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: SendMessageInput): Promise<MessageRecord> {
    this.authorizer.assert(actor, "messaging.message.send");
    await this.access.assertMember(actor, input.conversationId);

    const message = await this.unitOfWork.run(() => this.write(actor, input));

    // The **fast path**, after the commit and best effort. The subscriber publishes the
    // same frame durably, and the client dedupes by message id — so a lost one costs nothing.
    await this.realtime.publish(
      RealtimeChannels.conversation(actor.organizationId, input.conversationId),
      {
        kind: "event",
        id: Uuid.v7(),
        name: "message.sent",
        at: message.createdAt,
        payload: { conversationId: input.conversationId, messageId: message.id },
      },
    );

    return message;
  }

  // No `activity.record`. Chat volume is not an audit trail, and the outbox row is the
  // durable fact — writing both would double the write rate for nobody's benefit.
  private async write(actor: Principal, input: SendMessageInput): Promise<MessageRecord> {
    const message = await this.messages.save({
      organizationId: actor.organizationId,
      conversationId: input.conversationId,
      authorId: actor.userId,
      clientId: input.clientId,
      body: input.body,
    });

    await this.conversations.touch(
      actor.organizationId,
      input.conversationId,
      message.id,
      message.createdAt,
    );

    await this.events.publish(actor, {
      name: "message.sent",
      payload: {
        conversationId: input.conversationId,
        messageId: message.id,
        createdAt: message.createdAt,
      },
    });

    return message;
  }
}

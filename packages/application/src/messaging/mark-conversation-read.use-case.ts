import { type MarkConversationReadInput, Uuid } from "../import.js";
import type { RealtimePublisher } from "../port/index.js";
import { type Authorizer, type Principal, RealtimeChannels } from "../primitive/index.js";
import type { ConversationRepository } from "./conversation.repository.js";
import type { ConversationAccess } from "./conversation-access.js";

export class MarkConversationReadUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly conversations: ConversationRepository,
    private readonly realtime: RealtimePublisher,
  ) {}

  public async execute(actor: Principal, input: MarkConversationReadInput): Promise<void> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    await this.access.assertParticipant(actor, input.conversationId);

    // Idempotent in the repository — `GREATEST(last_read_at, ?)` — so a late mark for an
    // older message cannot move the position backwards.
    await this.conversations.markRead(
      actor.organizationId,
      input.conversationId,
      actor.userId,
      input.messageId,
      input.createdAt,
    );

    // On the reader's own user channel, not the conversation's: this is news for their
    // other tabs, and nobody else's badge changed.
    await this.realtime.publish(RealtimeChannels.user(actor.organizationId, actor.userId), {
      kind: "event",
      id: Uuid.v7(),
      name: "conversation.read",
      at: input.createdAt,
      payload: { conversationId: input.conversationId },
    });
  }
}

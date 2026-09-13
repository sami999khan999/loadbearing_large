import { type ConversationId, ForbiddenError } from "../import.js";
import type { Principal } from "../primitive/index.js";
import type { ConversationRecord, ConversationRepository } from "./conversation.repository.js";

// The second check every messaging use-case makes. A permission says what you may do,
// never which rooms you are in, and conflating the two is the way into a stranger's DM.
export class ConversationAccess {
  public constructor(private readonly conversations: ConversationRepository) {}

  // `FORBIDDEN` rather than `NOT_FOUND`, deliberately: the id came from this tenant's
  // own space, and pretending otherwise tells a caller nothing it did not already know.
  public async assertMember(
    actor: Principal,
    conversationId: ConversationId,
  ): Promise<ConversationRecord> {
    const conversation = await this.conversations.findById(actor.organizationId, conversationId);
    if (!conversation) throw new ForbiddenError("messaging.conversation.read");

    const member = conversation.members.some((entry) => entry.userId === actor.userId);
    if (!member) throw new ForbiddenError("messaging.conversation.read");

    return conversation;
  }
}

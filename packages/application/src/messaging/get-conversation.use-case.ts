import type { ConversationId } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { ConversationListItem } from "./list-conversations.use-case.js";
import type { MessageRepository } from "./message.repository.js";

export class GetConversationUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly messages: MessageRepository,
  ) {}

  // Also what the conversation stream calls before it subscribes: opening a channel is
  // the same question as reading it, and one implementation answers both.
  public async execute(
    actor: Principal,
    conversationId: ConversationId,
  ): Promise<ConversationListItem> {
    this.authorizer.assert(actor, "messaging.conversation.read");

    const conversation = await this.access.assertMember(actor, conversationId);
    // The same shape the list returns, unread included: a page reached from a link
    // would otherwise carry one field fewer than the same page reached from the list.
    const [unread] = await this.messages.unreadCounts(actor.organizationId, actor.userId, [
      conversationId,
    ]);

    return { ...conversation, unreadCount: unread?.count ?? 0 };
  }
}

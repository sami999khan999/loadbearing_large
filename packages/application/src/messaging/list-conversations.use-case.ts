import type { ListConversationsInput } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationRecord, ConversationRepository } from "./conversation.repository.js";
import type { MessageRepository } from "./message.repository.js";

// The record plus the one thing that is computed per reader. Kept out of
// `ConversationRecord` because it is a property of who is asking, not of the row.
export interface ConversationListItem extends ConversationRecord {
  readonly unreadCount: number;
}

export interface ConversationListPage {
  readonly items: readonly ConversationListItem[];
  readonly nextCursor: string | null;
}

export class ListConversationsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  // Always the actor's own. There is no "list someone else's" — the driving side of the
  // query is their membership rows.
  public async execute(
    actor: Principal,
    input: ListConversationsInput,
  ): Promise<ConversationListPage> {
    this.authorizer.assert(actor, "messaging.conversation.read");

    const page = await this.conversations.listByMember(actor.organizationId, actor.userId, input);
    // One statement for the whole page rather than one per row, and capped: a stale
    // channel costs a hundred index entries and renders "99+".
    const counts = await this.messages.unreadCounts(
      actor.organizationId,
      actor.userId,
      page.items.map((item) => item.id),
    );

    return {
      items: page.items.map((item) => ({
        ...item,
        unreadCount: counts.find((count) => count.conversationId === item.id)?.count ?? 0,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

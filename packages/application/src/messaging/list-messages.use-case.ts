import type { ListMessagesInput } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessagePageResult, MessageRepository } from "./message.repository.js";

export class ListMessagesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly messages: MessageRepository,
  ) {}

  public async execute(actor: Principal, input: ListMessagesInput): Promise<MessagePageResult> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    // The permission says this person may read conversations; this says which. A third
    // member of the organization gets FORBIDDEN here, not an empty page.
    await this.access.assertMember(actor, input.conversationId);

    return this.messages.list(actor.organizationId, {
      conversationId: input.conversationId,
      limit: input.limit,
      before: input.before,
    });
  }
}

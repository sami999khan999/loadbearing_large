import { ConflictError, type ConversationMemberInput } from "../import.js";
import type { DomainEventPublisher } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationRepository } from "./conversation.repository.js";
import type { ConversationAccess } from "./conversation-access.js";
import { MessagingRules } from "./messaging.rules.js";

export class RemoveConversationMemberUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly conversations: ConversationRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  public async execute(actor: Principal, input: ConversationMemberInput): Promise<void> {
    this.authorizer.assert(actor, "messaging.conversation.manage");
    const conversation = await this.access.assertMember(actor, input.conversationId);

    if (conversation.kind === "direct") throw new ConflictError("conversation", "direct");

    const target = conversation.members.find((member) => member.userId === input.userId);
    if (!target) return;

    // The same rule the organization's last owner has, for the same reason: afterwards
    // nobody could rename the channel or manage who is in it.
    const owners = conversation.members.filter((member) => MessagingRules.isOwner(member.role));
    if (MessagingRules.isOwner(target.role) && owners.length === 1) {
      throw new ConflictError("conversation", "lastOwner");
    }

    await this.conversations.deleteMember(actor.organizationId, input.conversationId, input.userId);

    await this.events.publish(actor, {
      name: "conversation.member.removed",
      payload: { conversationId: input.conversationId, userId: input.userId },
    });
  }
}

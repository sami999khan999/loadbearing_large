import { ConflictError, type CreateConversationInput, type UserId } from "../import.js";
import type { DomainEventPublisher, UnitOfWork } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationRepository } from "./conversation.repository.js";
import type { ConversationListItem } from "./list-conversations.use-case.js";
import { MessagingRules } from "./messaging.rules.js";

export class CreateConversationUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly conversations: ConversationRepository,
    private readonly events: DomainEventPublisher,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(
    actor: Principal,
    input: CreateConversationInput,
  ): Promise<ConversationListItem> {
    this.authorizer.assert(actor, "messaging.conversation.create");

    const other = input.memberIds[0];
    if (input.kind === "direct" && other === actor.userId) {
      throw new ConflictError("conversation", "self");
    }

    const directKey =
      input.kind === "direct" && other ? MessagingRules.directKey(actor.userId, other) : null;

    // Read first for the common case — opening a DM you already have — so the ordinary
    // path is one query rather than an insert that conflicts.
    if (directKey) {
      const existing = await this.conversations.findByDirectKey(actor.organizationId, directKey);
      // Zero rather than counted: this path returns a conversation the caller is about to
      // open, and the list it came from carries the real number.
      if (existing) return { ...existing, unreadCount: 0 };
    }

    return this.unitOfWork.run(() => this.insert(actor, input, directKey));
  }

  private async insert(
    actor: Principal,
    input: CreateConversationInput,
    directKey: string | null,
  ): Promise<ConversationListItem> {
    const members: readonly UserId[] = [
      actor.userId,
      ...input.memberIds.filter((id) => id !== actor.userId),
    ];

    const id = await this.conversations.save({
      organizationId: actor.organizationId,
      kind: input.kind,
      title: input.title ?? null,
      directKey,
      createdBy: actor.userId,
      memberIds: members,
    });

    // Read back rather than assembling the record here: on a conflict the row is the one
    // somebody else wrote a millisecond ago, and its members are theirs, not this input's.
    const conversation = await this.conversations.findById(actor.organizationId, id);
    if (!conversation) throw new ConflictError("conversation", "vanished");

    await this.events.publish(actor, {
      name: "conversation.created",
      payload: { conversationId: conversation.id, kind: conversation.kind },
    });

    return { ...conversation, unreadCount: 0 };
  }
}

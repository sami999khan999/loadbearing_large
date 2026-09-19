import {
  type ConversationId,
  type DomainEvent,
  type DomainEventName,
  type RealtimeEventName,
  Uuid,
} from "../import.js";
import type { RealtimePublisher } from "../port/index.js";
import { RealtimeChannels } from "../primitive/index.js";
import { EventSubscriber } from "../subscriber/index.js";
import type { ConversationRepository } from "./conversation.repository.js";

const EVENTS: readonly DomainEventName[] = [
  "conversation.created",
  "conversation.member.added",
  "conversation.member.removed",
  "conversation.renamed",
  "message.sent",
  "message.edited",
  "message.deleted",
];

// How many member frames go out together. Bounded rather than `Promise.all` over every
// member: a room of a hundred thousand is not a write buffer to build.
const FAN_OUT_CHUNK = 500;

// Which of them also reach each member's own stream, for the badge and the list order.
// The rest are conversation-local and cost nothing to anyone with it closed.
const FANS_OUT: ReadonlySet<string> = new Set([
  "conversation.created",
  "conversation.member.added",
  "message.sent",
]);

// The **durable path**. `SendMessageUseCase` publishes the same frame right after its
// commit; the client dedupes by message id, so a lost fast-path frame costs nothing.
export class MessagingRealtimeSubscriber extends EventSubscriber {
  public readonly name = "messaging-realtime";
  public readonly events = EVENTS;

  public constructor(
    private readonly realtime: RealtimePublisher,
    private readonly conversations: ConversationRepository,
  ) {
    super();
  }

  public async handle(event: DomainEvent): Promise<void> {
    const conversationId = MessagingRealtimeSubscriber.conversationOf(event);
    if (!conversationId) return;

    await this.realtime.publish(
      RealtimeChannels.conversation(event.organizationId, conversationId),
      {
        kind: "event",
        // Not `event.id`: one domain event becomes several frames, and a client deduping
        // by frame id would drop all but the first.
        id: Uuid.v7(),
        name: MessagingRealtimeSubscriber.frameName(event.name),
        at: event.occurredAt,
        payload: { conversationId },
      },
    );

    if (!FANS_OUT.has(event.name)) return;

    // N publishes for N members, which is the amplification a large channel pays. The
    // swap when it hurts is a summary from a counter — see docs/reference/messaging.md.
    const members = await this.conversations.memberIds(event.organizationId, conversationId);

    // In chunks, not one at a time: the frames are independent and best-effort, and a
    // round trip each was 23× slower at 25 000 members — infrastructure fan-out.md.
    for (let index = 0; index < members.length; index += FAN_OUT_CHUNK) {
      await Promise.all(
        members.slice(index, index + FAN_OUT_CHUNK).map((userId) =>
          this.realtime.publish(RealtimeChannels.user(event.organizationId, userId), {
            kind: "event",
            id: Uuid.v7(),
            name: "conversation.changed",
            at: event.occurredAt,
            payload: {},
          }),
        ),
      );
    }
  }

  // The conversation frames all say "something in this room changed"; only the message
  // ones are distinguished, because the client patches its page from them.
  private static frameName(name: DomainEventName): RealtimeEventName {
    if (name === "message.sent") return "message.sent";
    if (name === "message.edited") return "message.edited";
    if (name === "message.deleted") return "message.deleted";
    return "conversation.changed";
  }

  private static conversationOf(event: DomainEvent): ConversationId | null {
    if (!("conversationId" in event.payload)) return null;
    return event.payload.conversationId;
  }
}

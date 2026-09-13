import { describe, expect, it } from "vitest";
import type { ConversationRepository } from "../../src/messaging/conversation.repository.js";
import { ConversationAccess } from "../../src/messaging/conversation-access.js";
import type { MessageRepository, NewMessage } from "../../src/messaging/message.repository.js";
import { SendMessageUseCase } from "../../src/messaging/send-message.use-case.js";
import type { DomainEventPublisher, RealtimePublisher, UnitOfWork } from "../../src/port/index.js";
import {
  authorizer,
  CONVERSATION,
  CountingUnitOfWork,
  conversation,
  GRACE,
  message,
  OUTSIDER,
  principal,
  RecordingEvents,
  RecordingRealtime,
} from "./messaging-harness.js";

class Conversations {
  public touched = 0;

  public findById = () => Promise.resolve(conversation());
  public touch = () => {
    this.touched += 1;
    return Promise.resolve();
  };
}

class Messages {
  public readonly saved: NewMessage[] = [];

  public save = (input: NewMessage) => {
    this.saved.push(input);
    return Promise.resolve(message({ body: input.body, clientId: input.clientId }));
  };
}

const build = (conversations = new Conversations(), messages = new Messages()) => {
  const events = new RecordingEvents();
  const realtime = new RecordingRealtime();
  const unitOfWork = new CountingUnitOfWork();
  const repo = conversations as unknown as ConversationRepository;

  return {
    conversations,
    messages,
    events,
    realtime,
    unitOfWork,
    useCase: new SendMessageUseCase(
      authorizer,
      new ConversationAccess(repo),
      repo,
      messages as unknown as MessageRepository,
      events as unknown as DomainEventPublisher,
      realtime as unknown as RealtimePublisher,
      unitOfWork as unknown as UnitOfWork,
    ),
  };
};

const input = { conversationId: CONVERSATION, body: "hello", clientId: message().clientId };

describe("SendMessageUseCase", () => {
  // One save, one touch, one event — the write shape the whole slice's cost rests on.
  // A second statement per send is a second statement per message, forever.
  it("writes once, touches once and publishes one event", async () => {
    const harness = build();

    await harness.useCase.execute(principal(), input);

    expect(harness.messages.saved).toHaveLength(1);
    expect(harness.conversations.touched).toBe(1);
    expect(harness.events.published.map((event) => event.name)).toEqual(["message.sent"]);
    expect(harness.unitOfWork.calls).toBe(1);
  });

  // The fast path: after the commit, on the conversation channel, not fanned out per
  // member. The durable path publishes the same frame from the subscriber.
  it("publishes the fast-path frame on the conversation channel", async () => {
    const harness = build();

    await harness.useCase.execute(principal(), input);

    expect(harness.realtime.frames).toHaveLength(1);
    expect(harness.realtime.frames[0]?.channel).toContain(":conversation:");
  });

  // Membership, not the permission. A colleague who may send messages in general is
  // still not in this room.
  it("refuses a sender who is not a member", async () => {
    const harness = build();

    await expect(harness.useCase.execute(principal(OUTSIDER), input)).rejects.toThrow("FORBIDDEN");
    expect(harness.messages.saved).toEqual([]);
  });

  it("refuses a member who cannot send", async () => {
    const harness = build();
    const reader = principal(GRACE, ["messaging.conversation.read"]);

    await expect(harness.useCase.execute(reader, input)).rejects.toThrow("FORBIDDEN");
  });

  // No `activity.record`: chat volume is not an audit trail, and the outbox row is the
  // durable fact. Asserted because adding one is the easy mistake.
  it("carries the message id and its partition hint in the event", async () => {
    const harness = build();

    await harness.useCase.execute(principal(), input);
    const [event] = harness.events.published;

    expect(event?.payload).toMatchObject({
      conversationId: CONVERSATION,
      messageId: message().id,
      createdAt: message().createdAt,
    });
  });
});

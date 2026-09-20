import type { DomainEventInput, DomainEventName, RealtimeMessage } from "@loadbearing/contracts";
import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import type { ConversationRecord } from "../../src/messaging/conversation.repository.js";
import type { MessageRecord } from "../../src/messaging/message.repository.js";
import { Authorizer, Principal, type RealtimeChannel } from "../../src/primitive/index.js";

export const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
export const ADA = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
export const GRACE = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");
export const OUTSIDER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000013");
export const CONVERSATION = Identifiers.conversationId.parse(
  "018f8c00-0000-7000-8000-0000000000c1",
);
export const MESSAGE = Identifiers.messageId.parse("018f8c00-0000-7000-8000-0000000000d1");

export const NOW = new Date("2026-09-13T12:00:00Z");

export const authorizer = new Authorizer();

export const principal = (userId = ADA, keys: readonly PermissionKey[] = ALL_KEYS): Principal =>
  new Principal(
    ORG,
    userId,
    CapabilitySet.from({ wildcard: false, org: { grants: [...keys], denies: [] }, goals: {} }),
  );

const ALL_KEYS: readonly PermissionKey[] = [
  "messaging.conversation.read",
  "messaging.conversation.create",
  "messaging.message.send",
  "messaging.message.update",
];

export const conversation = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
  id: CONVERSATION,
  kind: "direct",
  title: null,
  createdBy: ADA,
  createdAt: NOW,
  lastMessageAt: null,
  lastMessageId: null,
  members: [
    { userId: ADA, role: "owner", joinedAt: NOW, lastReadAt: null },
    { userId: GRACE, role: "member", joinedAt: NOW, lastReadAt: null },
  ],
  ...over,
});

export const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  id: MESSAGE,
  conversationId: CONVERSATION,
  authorId: ADA,
  clientId: "018f8c00-0000-7000-8000-0000000000e1",
  body: "hello",
  deleted: false,
  editedAt: null,
  createdAt: NOW,
  ...over,
});

export interface RecordedEvent {
  readonly name: DomainEventName;
}

export class RecordingEvents {
  public readonly published: DomainEventInput<DomainEventName>[] = [];
  // Whether a transaction was open on each publish, in order. Given one, the fake can
  // answer the question a spec actually has about the outbox.
  public readonly inTransaction: boolean[] = [];

  public constructor(private readonly unitOfWork?: CountingUnitOfWork) {}

  public publish<N extends DomainEventName>(
    _actor: Principal,
    event: DomainEventInput<N>,
  ): Promise<void> {
    this.published.push(event as DomainEventInput<DomainEventName>);
    this.inTransaction.push(this.unitOfWork?.open ?? false);
    return Promise.resolve();
  }
}

export class RecordingRealtime {
  public readonly frames: { channel: string; message: RealtimeMessage }[] = [];

  public publish(channel: RealtimeChannel, message: RealtimeMessage): Promise<void> {
    this.frames.push({ channel, message });
    return Promise.resolve();
  }
}

// Runs the work and counts the call, like `DirectUnitOfWork` in composition — which this
// package may not import, being to its left.
export class CountingUnitOfWork {
  public calls = 0;
  // True only while `run`'s callback is executing. A publish that reads `false` here is
  // an outbox row that can commit apart from the write beside it.
  public open = false;

  public async run<T>(work: () => Promise<T>): Promise<T> {
    this.calls += 1;
    this.open = true;

    try {
      return await work();
    } finally {
      this.open = false;
    }
  }
}

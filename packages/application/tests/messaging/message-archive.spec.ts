import type { MessageId } from "@loadbearing/contracts";
import { describe, expect, it } from "vitest";
import type { ConversationRepository } from "../../src/messaging/conversation.repository.js";
import { ConversationAccess } from "../../src/messaging/conversation-access.js";
import { ListMessagesUseCase } from "../../src/messaging/list-messages.use-case.js";
import { ListThreadUseCase } from "../../src/messaging/list-thread.use-case.js";
import type { MessageRepository } from "../../src/messaging/message.repository.js";
import { MessageArchive } from "../../src/messaging/message-archive.js";
import type { PartitionArchiveGateway } from "../../src/port/index.js";
import {
  authorizer,
  CONVERSATION,
  conversation,
  membershipFrom,
  message,
  NOW,
  principal,
} from "./messaging-harness.js";

// `26.4`: archived months, as `monthsOf` lists them for the tenant's `messages`.
const month = (period: string, heldUntil: Date | null = null) => ({ period, heldUntil });
const archiveOf = (months: readonly { period: string; heldUntil: Date | null }[]) =>
  new MessageArchive(
    { monthsOf: () => Promise.resolve(months) } as unknown as PartitionArchiveGateway,
    { now: () => NOW },
  );

const access = (createdAt: Date) =>
  new ConversationAccess({
    findMembership: membershipFrom(() =>
      Promise.resolve(conversation({ lastMessageAt: NOW, createdAt })),
    ),
  } as unknown as ConversationRepository);

const oldestPage = {
  list: () => Promise.resolve({ items: [message()], olderCursor: null }),
  replyCounts: () => Promise.resolve(new Map()),
} as unknown as MessageRepository;

describe("ListMessagesUseCase — archived months", () => {
  it("names the newest cold month on the oldest page", async () => {
    const useCase = new ListMessagesUseCase(
      authorizer,
      access(new Date("2025-01-10T00:00:00Z")),
      oldestPage,
      null,
      null,
      archiveOf([month("2025-02-01"), month("2025-03-01")]),
    );

    const page = await useCase.execute(principal(), { conversationId: CONVERSATION, limit: 30 });

    expect(page.archivedThrough).toBe("2025-03-01");
  });

  it("says nothing of a month before the conversation began, or one held after a restore", async () => {
    const useCase = new ListMessagesUseCase(
      authorizer,
      access(new Date("2025-03-05T00:00:00Z")),
      oldestPage,
      null,
      null,
      archiveOf([
        month("2025-01-01"),
        month("2025-02-01"),
        month("2025-03-01", new Date("2099-01-01")),
      ]),
    );

    const page = await useCase.execute(principal(), { conversationId: CONVERSATION, limit: 30 });

    expect(page.archivedThrough).toBeNull();
  });
});

describe("ListThreadUseCase — an archived root", () => {
  const ROOT = "018f8c00-0000-7000-8000-0000000000a9" as MessageId;
  const messages = { findById: () => Promise.resolve(null) } as unknown as MessageRepository;
  const input = (createdAt: Date) => ({
    conversationId: CONVERSATION,
    messageId: ROOT,
    createdAt,
    limit: 30,
  });

  it("says the root is archived rather than missing", async () => {
    const useCase = new ListThreadUseCase(
      authorizer,
      access(NOW),
      messages,
      null,
      null,
      archiveOf([month("2025-03-01")]),
    );

    const page = await useCase.execute(principal(), input(new Date("2025-03-17T09:00:00Z")));

    expect(page).toEqual({ items: [], newerCursor: null, rootArchived: true });
  });

  it("is still NOT_FOUND for a root whose month is in Postgres", async () => {
    const useCase = new ListThreadUseCase(
      authorizer,
      access(NOW),
      messages,
      null,
      null,
      archiveOf([month("2025-03-01")]),
    );

    await expect(
      useCase.execute(principal(), input(new Date("2025-04-02T09:00:00Z"))),
    ).rejects.toThrow("NOT_FOUND");
  });
});

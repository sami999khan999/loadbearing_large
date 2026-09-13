import { describe, expect, it } from "vitest";
import type { ConversationRepository } from "../../src/messaging/conversation.repository.js";
import { ConversationAccess } from "../../src/messaging/conversation-access.js";
import { CONVERSATION, conversation, OUTSIDER, principal } from "./messaging-harness.js";

const access = (found: ReturnType<typeof conversation> | null) =>
  new ConversationAccess({
    findById: () => Promise.resolve(found),
  } as unknown as ConversationRepository);

describe("ConversationAccess", () => {
  it("returns the conversation to a member", async () => {
    await expect(
      access(conversation()).assertMember(principal(), CONVERSATION),
    ).resolves.toMatchObject({
      id: CONVERSATION,
    });
  });

  // FORBIDDEN, not NOT_FOUND: the id came from this tenant's own space, and a different
  // code would tell a caller nothing it did not already know.
  it("refuses somebody who is not a member", async () => {
    await expect(
      access(conversation()).assertMember(principal(OUTSIDER), CONVERSATION),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("refuses a conversation that does not exist, with the same code", async () => {
    await expect(access(null).assertMember(principal(), CONVERSATION)).rejects.toThrow("FORBIDDEN");
  });
});

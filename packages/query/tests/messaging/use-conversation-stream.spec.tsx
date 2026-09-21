import type { ApiClient } from "@loadbearing/api-client";
import type { RealtimeMessage } from "@loadbearing/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { useConversationStream } from "../../src/messaging/use-conversation-stream.js";

const CONVERSATION = "00000000-0000-7000-8000-000000000001";
const ME = "00000000-0000-7000-8000-00000000000a";
const THEM = "00000000-0000-7000-8000-00000000000b";

const typing = (userId: string): RealtimeMessage => ({
  kind: "typing",
  id: "00000000-0000-7000-8000-0000000000ff",
  conversationId: CONVERSATION,
  userId,
  at: new Date("2026-01-01T00:00:00Z"),
});

// Yields its frames and then parks, the way a real stream does between them, so the
// spec reads the state without racing the generator's completion.
function clientYielding(messages: readonly RealtimeMessage[]): ApiClient {
  return {
    message: {
      stream: () =>
        Promise.resolve(
          (async function* () {
            for (const message of messages) yield message;
            await new Promise(() => {});
          })(),
        ),
    },
  } as unknown as ApiClient;
}

function Probe({ client, selfId }: { readonly client: ApiClient; readonly selfId?: string }) {
  const { typing: names } = useConversationStream(client, CONVERSATION, selfId);
  return createElement("span", { "data-testid": "typing" }, names.join(","));
}

const tree = (client: ApiClient, selfId?: string) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(Probe, { client, selfId }),
  );

describe("useConversationStream typing", () => {
  it("renders somebody else typing", async () => {
    const screen = render(tree(clientYielding([typing(THEM)]), ME));

    await waitFor(() => expect(screen.getByTestId("typing").textContent).toBe(THEM));
  });

  // `23.25`: the frame is addressed to the whole conversation channel, author included,
  // so without this the person typing was told that they were typing.
  it("does not render the reader typing at themselves", async () => {
    const screen = render(tree(clientYielding([typing(ME), typing(THEM)]), ME));

    // The reader's frame is yielded *first*, and this waits for the one after it. An
    // ──
    // assertion that the text is empty would pass before any frame landed at all, which
    // is a spec that goes green against the defect it was written for.
    await waitFor(() => expect(screen.getByTestId("typing").textContent).toBe(THEM));
    expect(screen.getByTestId("typing").textContent).not.toContain(ME);
  });

  // A caller that passes no id is unchanged, which is what keeps this additive.
  it("renders every frame when no reader id is given", async () => {
    const screen = render(tree(clientYielding([typing(ME)])));

    await waitFor(() => expect(screen.getByTestId("typing").textContent).toBe(ME));
  });
});

import { MessageStore, StaticContentSource } from "@loadbearing/content";
import type { CapabilitySetDto } from "@loadbearing/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionProvider, type SessionUser } from "../../src/auth/session.context.js";
import { MessageProvider } from "../../src/i18n/message.context.js";

export const TEST_USER: SessionUser = {
  id: "00000000-0000-7000-8000-000000000001",
  email: "ada@example.test",
  name: "Ada",
};

// Doc 23 builds this on `BundledContentSource.snapshotSync`, which is a doc 30 item and
// does not exist yet. `StaticContentSource` gives the same snapshot asynchronously, so
// the harness is async and nothing else changes.
export const messageStore = async (namespaces: readonly ("nav" | "auth")[] = []) => {
  const content = new StaticContentSource();
  return new MessageStore(content, await content.messages("en", namespaces));
};

export const renderWithFakes = async (
  ui: ReactNode,
  capabilities: CapabilitySetDto,
  user: SessionUser | null = TEST_USER,
): Promise<RenderResult> => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  const messages = await messageStore(["auth"]);

  return render(
    <QueryClientProvider client={queryClient}>
      <MessageProvider messages={messages}>
        <SessionProvider user={user} capabilities={capabilities}>
          {ui}
        </SessionProvider>
      </MessageProvider>
    </QueryClientProvider>,
  );
};

export const capabilitiesWith = (grants: readonly string[]): CapabilitySetDto =>
  ({ wildcard: false, org: { grants: [...grants], denies: [] }, goals: {} }) as CapabilitySetDto;

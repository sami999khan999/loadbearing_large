import { type ClientNamespace, MessageStore, StaticContentSource } from "@loadbearing/content";
import {
  type CapabilitySetDto,
  type PermissionKey,
  PermissionRegistry,
} from "@loadbearing/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionProvider, type SessionUser } from "../../src/auth/session.context.js";
import { MessageProvider } from "../../src/i18n/message.context.js";

export const TEST_ORGANIZATION = { id: "00000000-0000-7000-8000-0000000000a1", name: "Acme" };

export const TEST_USER: SessionUser = {
  id: "00000000-0000-7000-8000-000000000001",
  email: "ada@example.test",
  name: "Ada",
  activeOrganizationId: TEST_ORGANIZATION.id,
  organizations: [TEST_ORGANIZATION],
  twoFactorEnabled: false,
};

// `StaticContentSource` gives the snapshot asynchronously, which is why this harness is
// async.
export const messageStore = async (namespaces: readonly ClientNamespace[] = []) => {
  const content = new StaticContentSource();
  return new MessageStore(content, await content.messages("en", namespaces));
};

export const renderWithFakes = async (
  ui: ReactNode,
  capabilities: CapabilitySetDto,
  user: SessionUser | null = TEST_USER,
  // `auth` by default, because most components under test read it. A spec elsewhere names
  // its own namespace, as a route would.
  namespaces: readonly ClientNamespace[] = ["auth"],
): Promise<RenderResult> => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  const messages = await messageStore(namespaces);

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

// The keys a grant can change the answer for. Not `all()`: every `core.*` key is held by
// any resolved principal, so granting one tells two fixtures apart from nothing.
export const GRANTABLE: readonly PermissionKey[] = PermissionRegistry.instance
  .all()
  .filter((key) => PermissionRegistry.instance.meta(key)?.module !== "core");

export const CORE_KEYS: readonly PermissionKey[] = PermissionRegistry.instance
  .all()
  .filter((key) => PermissionRegistry.instance.meta(key)?.module === "core");

import { ApiClient, CookieAuthStrategy } from "@loadbearing/api-client";
import { type MessageSnapshot, MessageStore, StaticContentSource } from "@loadbearing/content";
import { createQueryClient } from "@loadbearing/query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { Endpoint } from "./endpoint.js";
import { routeTree } from "./route-tree.gen";

export interface RouterDehydrated {
  readonly messages: MessageSnapshot;
}

// Start calls this per request on the server and once in the browser, which is exactly
// the lifetime every object below wants. A module-scope `QueryClient` or `MessageStore`
// in a server bundle is shared across concurrent requests — under this permission model
// a cross-tenant leak, not a caching bug (21).
export function getRouter() {
  // The client catalog, never the server one: `email` is server-only and the ESLint ban
  // in 05 is what keeps it that way.
  const content = new StaticContentSource();
  const messages = new MessageStore(content, MessageStore.empty("en"));
  const { queryClient, apiClient } = createQueryClient({
    transport: ApiClient.overHttp(Endpoint.rpc, new CookieAuthStrategy()),
  });

  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Load-bearing, not a nicety: without it the first navigation into a namespace
    // nobody has needed yet resolves its dynamic import *during* the loader — a visible
    // pause on a route that would otherwise be instant.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: { messages, queryClient, api: apiClient },
    // Runs after every matched route's loader has resolved, so the snapshot is already
    // the union of the shell plus every namespace on the entry path. `hydrate` runs
    // before the first client render, so that render sees a complete `Translator` —
    // no fetch, no waterfall, no flash of English.
    dehydrate: (): RouterDehydrated => ({ messages: messages.dehydrate() }),
    hydrate: (payload: RouterDehydrated) => messages.restore(payload.messages),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

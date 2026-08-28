import { ApiClient, CookieAuthStrategy } from "@loadbearing/api-client";
import { type MessageSnapshot, MessageStore, StaticContentSource } from "@loadbearing/content";
import { createQueryClient } from "@loadbearing/query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { Endpoint } from "./endpoint.js";
import { routeTree } from "./route-tree.gen";
import { type SessionSnapshot, SessionStore } from "./session-store.js";

export interface RouterDehydrated {
  readonly messages: MessageSnapshot;
  // Rides the same payload as the message snapshot, for the same reason: resolved once
  // on the server, complete before the first client render. Without it the root's
  // `beforeLoad` would re-fetch during hydration and every gated element would flash.
  readonly session: SessionSnapshot;
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
  const session = new SessionStore();
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
    // `user` and `capabilities` are seeded signed-out. `__root.tsx` resolves them for
    // every route beneath it; a guard that somehow ran before that sees `empty()`, which
    // denies — there is no loading state that grants access (23).
    context: {
      messages,
      queryClient,
      api: apiClient,
      session,
      // Seeded signed-out. `__root.tsx` resolves the real pair for every route beneath
      // it; an empty capability set denies everything, and there is no loading state
      // that grants access (23).
      user: session.user,
      capabilities: session.dto,
    },
    // Runs after every matched route's loader has resolved, so the snapshot is already
    // the union of the shell plus every namespace on the entry path. `hydrate` runs
    // before the first client render, so that render sees a complete `Translator` —
    // no fetch, no waterfall, no flash of English.
    dehydrate: (): RouterDehydrated => ({
      messages: messages.dehydrate(),
      session: session.dehydrate(),
    }),
    hydrate: (payload: RouterDehydrated) => {
      messages.restore(payload.messages);
      session.restore(payload.session);
    },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

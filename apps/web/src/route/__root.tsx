import { ContentSource } from "@loadbearing/content";
import { MessageProvider, SessionProvider } from "@loadbearing/feature";
import { CapabilitySet, type CapabilitySetDto } from "@loadbearing/permissions";
import { ApiClientProvider } from "@loadbearing/query";
import { ThemeRegistry } from "@loadbearing/ui";
import themeCss from "@loadbearing/ui/theme.css?url";
import tokenCss from "@loadbearing/ui/token.css?url";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { RouterContext } from "./-context.js";

// Applied before hydration, or a dark-theme user gets a white flash on every load.
// Inline and synchronous for exactly that reason — a `useEffect` runs too late.
const THEME_SCRIPT = `(()=>{try{const t=localStorage.getItem("theme");const k=t==="dark"||t==="light"?t:"${ThemeRegistry.DEFAULT}";document.documentElement.dataset.theme=k;document.documentElement.style.colorScheme=k;}catch{}})()`;

// Signed out until the session loader says otherwise. `empty()` denies everything —
// there is no loading state that grants access (23).
const ANONYMOUS: CapabilitySetDto = CapabilitySet.empty().toJSON();

export const Route = createRootRouteWithContext<RouterContext>()({
  // The shell namespaces, on the one route every match has under it. `MessageStore.empty()`
  // starts at `namespaces: []`, and `ensure()` returns early when nothing is missing — so
  // a route that declares none of its own (`/`, `/forbidden`) reached `t()` with an empty
  // catalog and rendered raw keys. A route that declares its own namespaces never showed
  // it, because `ContentSource.resolve()` unions the shell into that fetch.
  //
  // This runs before every child loader, and `dehydrate()` runs after all of them, so the
  // snapshot in the SSR payload is still the union of the shell plus the entry path (24.10).
  loader: ({ context }) => context.messages.ensure(ContentSource.SHELL),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Loadbearing" },
    ],
    links: [
      { rel: "stylesheet", href: tokenCss },
      { rel: "stylesheet", href: themeCss },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  const { messages, queryClient, api } = Route.useRouteContext();

  return (
    // `lang` from the negotiated locale: screen readers switch voice on it, and
    // browsers pick hyphenation and quote rules from it.
    <html lang={messages.translator.locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ApiClientProvider client={api}>
            {/* The store, not a bare `Translator` — client-side navigation adds
                namespaces after this provider has mounted (23). */}
            <MessageProvider messages={messages}>
              {/* Anonymous until the session loader lands (24.11). The shape is what
                  matters now: the DTO is meant to be resolved during SSR so the first
                  rendered HTML already gates correctly — fetch it client-side and every
                  gated element flashes.

                  `children` **is** the matched subtree, so there is no `<Outlet />` here.
                  A `shellComponent` wraps the root match rather than sitting inside it,
                  and the router hands it what it would otherwise have rendered; adding an
                  `<Outlet />` beside it draws every page twice. */}
              <SessionProvider user={null} capabilities={ANONYMOUS}>
                {children}
              </SessionProvider>
            </MessageProvider>
          </ApiClientProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

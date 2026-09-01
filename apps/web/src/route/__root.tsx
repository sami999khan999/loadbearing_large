import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import {
  ApiClientProvider,
  ContentSource,
  classCss,
  MessageProvider,
  QueryClientProvider,
  type ReactNode,
  SessionProvider,
  ThemeRegistry,
  themeCss,
} from "~/import.js";
import { fetchAppearance } from "~/server/appearance.fn.js";
import { fetchSession } from "~/server/session.fn.js";
import type { RouterContext } from "./-context.js";

// The one case the cookie cannot answer: the user asked for "system" and the request
// carried no client hint, so the server had to guess light. Synchronous and in <head>,
// or the correction lands after first paint and the user watches it happen.
const SYSTEM_MODE_SCRIPT = `(()=>{try{if(matchMedia("(prefers-color-scheme:dark)").matches){const r=document.documentElement;r.dataset.mode="dark";r.style.colorScheme="dark";}}catch{}})()`;

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    await Promise.all([
      context.session.ensure(fetchSession),
      context.appearance.ensure(fetchAppearance),
    ]);
    return {
      user: context.session.user,
      capabilities: context.session.dto,
      googleEnabled: context.session.googleEnabled,
      appearanceSnapshot: context.appearance.current,
    };
  },
  loader: ({ context }) => context.messages.ensure(ContentSource.SHELL),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Loadbearing" },
    ],
    links: [
      // Tokens and colours first, the default look second: class.css reads the names
      // theme.css defines, and an app supplying its own design drops the second link.
      { rel: "stylesheet", href: themeCss },
      { rel: "stylesheet", href: classCss },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  const { messages, queryClient, api, user, capabilities, appearanceSnapshot } =
    Route.useRouteContext();
  const { theme, mode, preference } = appearanceSnapshot;

  // Only when the server had to guess, and only for a palette that has a dark block —
  // the script can upgrade light to dark and never the other way, so it cannot fight
  // an explicit choice or strand a dark-only theme.
  const correctsMode = preference === "system" && ThemeRegistry.supports(theme, "dark");

  return (
    <html
      lang={messages.translator.locale}
      data-theme={theme}
      data-mode={mode}
      style={{ colorScheme: mode }}
    >
      <head>
        <HeadContent />
        {correctsMode ? <script dangerouslySetInnerHTML={{ __html: SYSTEM_MODE_SCRIPT }} /> : null}
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ApiClientProvider client={api}>
            <MessageProvider messages={messages}>
              <SessionProvider user={user} capabilities={capabilities}>
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

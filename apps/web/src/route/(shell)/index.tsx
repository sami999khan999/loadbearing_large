import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Button,
  Can,
  CapabilitySet,
  type ClientNamespace,
  EmptyState,
  MemberCount,
  MemberQueries,
  ModuleNav,
  useCapabilities,
  useMessages,
  useSession,
} from "~/import.js";

// `nav` for the menu and this page's own copy; `common` rides in on the root loader.
const MESSAGES = ["nav"] as const satisfies readonly ClientNamespace[];

// The same page `MemberCount` asks for. `limit: 1` because only `total` is read and a
// page of rows would be fetched and thrown away.
const PAGE = { limit: 1, offset: 0 } as const;

// Ungated: it is the target of every post-sign-in, post-switch and post-create
// navigation, and it is also the first page an anonymous visitor sees.
export const Route = createFileRoute("/(shell)/")({
  staticData: { messages: MESSAGES },
  loader: async ({ context }) => {
    // The count is prefetched only when the same key `<Can>` checks allows it, so an
    // anonymous or unpermitted visit issues no member query at all.
    const counted = CapabilitySet.from(context.capabilities).can("member.read")
      ? context.queryClient.ensureQueryData(MemberQueries.list(context.api, PAGE))
      : Promise.resolve(null);

    const [, nav] = await Promise.all([
      context.messages.ensure(MESSAGES),
      context.content.nav(),
      counted,
    ]).then(([a, b]) => [a, b] as const);

    return { nav };
  },
  component: Home,
});

function Home() {
  const { t } = useMessages("nav");
  const shell = useMessages("common");
  const { nav } = Route.useLoaderData();
  const { user } = useSession();
  const capabilities = useCapabilities();

  if (!user) {
    return (
      <main>
        <EmptyState
          title={t("nav.home.signedOut")}
          action={
            <Link to="/sign-in">
              <Button>{t("nav.home.goToSignIn")}</Button>
            </Link>
          }
        />
      </main>
    );
  }

  // The session already carries every membership with its role, so naming the current
  // one costs no query — `fetchSession` resolved it in the same indexed read.
  const active = user.organizations.find((entry) => entry.id === user.activeOrganizationId);

  return (
    <main>
      <h1>{t("nav.home.title", { organization: active?.name ?? shell.t("state.empty") })}</h1>
      {active ? <p>{t("nav.home.role", { role: active.roleName })}</p> : null}

      {
        // Gated on the same key the procedure is: a count nobody may read is a query
        // nobody should issue.
      }
      <Can permission="member.read" capabilities={capabilities}>
        <MemberCount />
      </Can>

      <ModuleNav
        items={nav}
        capabilities={capabilities}
        renderLink={(route, label, icon) => (
          <Link key={route} to={route}>
            {icon}
            {label}
          </Link>
        )}
      />
    </main>
  );
}

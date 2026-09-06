import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  type ClientNamespace,
  ModuleNav,
  OrganizationClient,
  OrganizationSwitcher,
  SignOutButton,
  useCapabilities,
  useMemo,
  useMessages,
} from "~/import.js";
import { Pending } from "~/route/-boundary.js";
import { RouteGuard } from "~/route/-guard.js";
import { LocaleSwitcher } from "~/route/-locale.js";
import { refreshSession } from "~/route/-session.js";

// `nav` for the gated destinations below; `auth` for everything else the header says.
const MESSAGES = ["nav"] as const satisfies readonly ClientNamespace[];

// The one place that says every page under `(app)` needs a session. Pathless: the
// leading underscore keeps `_authenticated` out of the URL.
export const Route = createFileRoute("/(app)/_authenticated")({
  beforeLoad: RouteGuard.requireSession(),
  // The header renders `auth` copy on every page in this subtree, so the namespace is
  // ensured here rather than in each leaf.
  staticData: { messages: MESSAGES },
  // The menu is content, so it is loaded like content. Both in parallel: neither
  // depends on the other and the header needs both before it renders.
  loader: async ({ context }) => {
    // The logo goes through `ContentSource.media()` rather than importing the file:
    // content records hold `"brand.logo"`, never a path, so a CDN is one adapter.
    const [, nav, logo] = await Promise.all([
      context.messages.ensure(MESSAGES),
      context.content.nav(),
      context.content.media("brand.logo"),
    ]);

    return { nav, logo };
  },
  component: AuthenticatedLayout,
  // Covers every page below, so a leaf whose loader prefetches — `/settings/roles`
  // does — has a state to show rather than a blank frame.
  pendingComponent: Pending,
});

function AuthenticatedLayout() {
  const { t } = useMessages("nav");
  const { nav, logo } = Route.useLoaderData();
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const router = useRouter();
  const { session, queryClient, appearance, appearanceSnapshot } = Route.useRouteContext();

  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);
  const organization = useMemo(() => new OrganizationClient(auth), [auth]);

  const refresh = (to: "/" | "/sign-in") => () =>
    refreshSession({
      queryClient,
      session,
      invalidateRouter: () => router.invalidate(),
      go: () => void navigate({ to }),
    });

  // After a switch every cached row belongs to the tenant just left, and the snapshot
  // names the old one — the same reason a sign-out clears.
  const signedOut = refresh("/sign-in");
  const switched = refresh("/");

  return (
    <>
      <header>
        <img src={logo.src} width={logo.width} height={logo.height} alt={logo.alt} />
        <OrganizationSwitcher
          organization={organization}
          onSwitched={switched}
          onCreate={() => void navigate({ to: "/organization/new" })}
        />
        {
          // Ungated on purpose: your own account and security pages need no capability,
          // which is why `account.routes.ts` declares no gate for them.
          <nav>
            <Link to="/settings/account">{t("nav.account")}</Link>
            <Link to="/settings/security">{t("nav.security")}</Link>
          </nav>
        }
        {
          // The gated half, from `ContentSource.nav()` joined to `MODULE_GATES`. A link
          // hidden here still answers FORBIDDEN if the path is typed by hand.
        }
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
        <LocaleSwitcher appearance={appearance} current={appearanceSnapshot.locale} />
        <SignOutButton auth={auth} onSignedOut={signedOut} />
      </header>
      <Outlet />
    </>
  );
}

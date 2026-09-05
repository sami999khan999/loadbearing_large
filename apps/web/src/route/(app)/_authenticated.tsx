import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  Can,
  type ClientNamespace,
  OrganizationClient,
  OrganizationSwitcher,
  SignOutButton,
  useCapabilities,
  useMemo,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

// `nav` for the gated destinations below; `auth` for everything else the header says.
const MESSAGES = ["auth", "nav"] as const satisfies readonly ClientNamespace[];

// The one place that says every page under `(app)` needs a session. Pathless: the
// leading underscore keeps `_authenticated` out of the URL.
export const Route = createFileRoute("/(app)/_authenticated")({
  beforeLoad: RouteGuard.requireSession(),
  // The header renders `auth` copy on every page in this subtree, so the namespace is
  // ensured here rather than in each leaf.
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { t } = useMessages("auth");
  const nav = useMessages("nav");
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const router = useRouter();
  const { session, queryClient } = Route.useRouteContext();

  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);
  const organization = useMemo(() => new OrganizationClient(auth), [auth]);

  // Clear the cache, invalidate the session store, re-run the root loader — in that
  // order. See packages/query/docs/reference/mutations.md.
  const signedOut = () => {
    queryClient.clear();
    session.invalidate();
    void router.invalidate().then(() => navigate({ to: "/sign-in" }));
  };

  // The same three steps: after a switch every cached row belongs to the tenant just
  // left, and the snapshot names the old one.
  const switched = () => {
    queryClient.clear();
    session.invalidate();
    void router.invalidate().then(() => navigate({ to: "/" }));
  };

  return (
    <>
      <header>
        <OrganizationSwitcher
          organization={organization}
          onSwitched={switched}
          onCreate={() => void navigate({ to: "/organization/new" })}
        />
        <nav>
          <Link to="/settings/account">{t("auth.account")}</Link>
          <Link to="/settings/security">{t("auth.security")}</Link>
          {
            // The same keys the guards and use-cases check: a link hidden here still
            // answers FORBIDDEN if typed by hand.
          }
          <Can permission="member.read" capabilities={capabilities}>
            <Link to="/settings/members">{nav.t("nav.members")}</Link>
          </Can>
          <Can permission="rbac.role.read" capabilities={capabilities}>
            <Link to="/settings/roles">{nav.t("nav.roles")}</Link>
          </Can>
        </nav>
        <SignOutButton auth={auth} onSignedOut={signedOut} />
      </header>
      <Outlet />
    </>
  );
}

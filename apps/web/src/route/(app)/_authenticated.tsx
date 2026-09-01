import { createFileRoute, Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import { AuthClient, type ClientNamespace, SignOutButton, useMemo, useMessages } from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

// Every page under `(app)` needs a session, and this is the one place that says so. A
// leaf below states only the capability it needs — repeating `requireSession()` in each
// one is how the fourth page forgets it.
//
// Pathless: the leading underscore keeps `_authenticated` out of the URL, so the guard
// nests without `/settings/roles` becoming `/_authenticated/settings/roles`.
export const Route = createFileRoute("/(app)/_authenticated")({
  beforeLoad: RouteGuard.requireSession(),
  // The header below renders `auth` copy, and it renders on every page in this subtree —
  // so the namespace is ensured here rather than repeated in each leaf.
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { t } = useMessages("auth");
  const navigate = useNavigate();
  const router = useRouter();
  const { session, queryClient } = Route.useRouteContext();

  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);

  // The mirror image of `/sign-in`'s `complete()`. Three things have to happen and the
  // order matters: clear the whole query cache, because the next person to sign in on
  // this machine must not see a flash of the last one's data (21); invalidate the
  // session store, which would otherwise keep answering "signed in" for the life of the
  // tab; then re-run the root loader so the guard above sends us to `/sign-in`.
  const signedOut = () => {
    queryClient.clear();
    session.invalidate();
    void router.invalidate().then(() => navigate({ to: "/sign-in" }));
  };

  return (
    <>
      <header>
        <nav>
          <Link to="/settings/account">{t("auth.account")}</Link>
          <Link to="/settings/security">{t("auth.security")}</Link>
        </nav>
        <SignOutButton auth={auth} onSignedOut={signedOut} />
      </header>
      <Outlet />
    </>
  );
}

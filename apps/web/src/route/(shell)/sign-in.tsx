import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  type ClientNamespace,
  SignInForm,
  SocialSignIn,
  TwoFactorForm,
  useMemo,
  useMessages,
  useState,
} from "~/import.js";
import { RedirectSearch } from "~/route/-redirect.js";

// One local const, referenced twice: `staticData` is what a prefetcher or a coverage
// test can read without executing anything, and the loader is what resolves it.
// Deriving one from the other means reaching into `ctx.route.options`, which is
// version-sensitive in exactly the way this document keeps warning about.
const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

export const Route = createFileRoute("/(shell)/sign-in")({
  // `?redirect=/invitation/<token>` is how the landing page gets someone back to the
  // accept button. Validated to a rooted path — see `RedirectSearch`.
  validateSearch: RedirectSearch.schema,
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: SignInPage,
});

function SignInPage() {
  const { t } = useMessages("auth");
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const { session, googleEnabled } = Route.useRouteContext();
  // Which leg of the flow is on screen. A second factor turns one form into two, and
  // the state lives here rather than in either form because neither of them owns the
  // transition — this route does.
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  // A prop, not a module singleton — the instance differs per environment (23). Memoised
  // because a bare `new` in the body builds a fresh Better Auth client, and a fresh
  // `SessionMutations` identity, on every keystroke in the form.
  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);

  // The cookie exists now, and nothing else knows. `SessionStore` answered "anonymous"
  // during SSR and would keep answering it for the rest of this tab's life, so the
  // shell would render signed-out around a signed-in application until a full reload.
  // Invalidating both is what makes the root's `beforeLoad` ask again before we leave.
  //
  // `href` rather than `to`: the destination is a validated string, not a route the
  // type system can name, and `href` is the router's option for exactly that.
  const complete = () => {
    session.invalidate();
    void router.invalidate().then(() => navigate({ href: RedirectSearch.target(search) }));
  };

  return (
    <main>
      {needsTwoFactor ? (
        <TwoFactorForm auth={auth} onSuccess={complete} />
      ) : (
        <>
          {/* Rendered above the form and hidden entirely when no credentials were
              configured — `googleEnabled` rides the session snapshot because `Env` is
              server-only and a button leading to an unconfigured provider is worse than
              no button. */}
          <SocialSignIn
            auth={auth}
            enabled={googleEnabled}
            callbackUrl={RedirectSearch.target(search)}
            errorCallbackUrl="/sign-in"
          />
          <SignInForm
            auth={auth}
            onSuccess={complete}
            onNeedsTwoFactor={() => setNeedsTwoFactor(true)}
          />
          <nav>
            <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
            <Link to="/sign-up">{t("auth.noAccount")}</Link>
          </nav>
        </>
      )}
    </main>
  );
}

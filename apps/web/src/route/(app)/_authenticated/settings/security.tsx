import { createFileRoute } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AccountClient,
  AuthClient,
  type ClientNamespace,
  LinkedAccountList,
  TwoFactorPanel,
  TwoFactorSetup,
  useMemo,
  useMessages,
  useState,
} from "~/import.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

// No `requirePermission`. Managing your own credentials is not a capability anyone can
// be denied, so `(app)/_authenticated.tsx`'s `requireSession()` is the whole gate — and
// that is why this slice added no permission key and needs no seeding migration.
export const Route = createFileRoute("/(app)/_authenticated/settings/security")({
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: SecurityPage,
});

function SecurityPage() {
  const { t } = useMessages("auth");
  const { googleEnabled, session } = Route.useRouteContext();

  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);
  // One Better Auth instance behind both, so a fetch here and a `getSession()` there
  // share the same cookie handling and the same plugin set.
  const account = useMemo(() => new AccountClient(auth), [auth]);

  // Read from the store rather than a query: the root route already resolved it during
  // SSR, so the page knows on its first render whether two-factor is on.
  const [enrolled, setEnrolled] = useState(session.user !== null && twoFactorOf(session.user));

  return (
    <main>
      <h1>{t("auth.security")}</h1>

      <section>
        <h2>{t("auth.twoFactorTitle")}</h2>
        {enrolled ? (
          <TwoFactorPanel account={account} />
        ) : (
          <TwoFactorSetup account={account} onEnabled={() => setEnrolled(true)} />
        )}
      </section>

      <section>
        <h2>{t("auth.linkedAccounts")}</h2>
        <LinkedAccountList
          account={account}
          googleEnabled={googleEnabled}
          // Back to this page, so a link round trip through Google returns where it
          // started rather than dumping the user on the home page.
          linkCallbackUrl="/settings/security"
        />
      </section>
    </main>
  );
}

// `SessionUser` carries only the three fields the shell renders, so the flag is read
// structurally rather than widening that type for one page. Absent means off, which is
// the direction to fail in: it offers enrolment to someone already enrolled, and Better
// Auth refuses that — where the inverse would hide the only way to turn it on.
function twoFactorOf(user: unknown): boolean {
  return (user as { twoFactorEnabled?: boolean }).twoFactorEnabled === true;
}

import { createFileRoute } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AccountClient,
  ActiveSessionList,
  AuthClient,
  ChangeEmailForm,
  ChangePasswordForm,
  type ClientNamespace,
  ProfileForm,
  useMemo,
  useMessages,
} from "~/import.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

// Session-gated only, like `/settings/security` and for the same reason.
export const Route = createFileRoute("/(app)/_authenticated/settings/account")({
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: AccountPage,
});

function AccountPage() {
  const { t } = useMessages("auth");
  const { user } = Route.useRouteContext();

  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);
  const account = useMemo(() => new AccountClient(auth), [auth]);

  // The layout above already ran `requireSession()`, so this is unreachable. Narrowing
  // rather than asserting, because a `!` here would be a runtime crash the day someone
  // moves this file out from under the guard.
  if (!user) return null;

  return (
    <main>
      <h1>{t("auth.account")}</h1>

      <section>
        <h2>{t("auth.profile")}</h2>
        <ProfileForm account={account} currentName={user.name} />
      </section>

      <section>
        <h2>{t("auth.changePassword")}</h2>
        <ChangePasswordForm account={account} />
      </section>

      <section>
        <h2>{t("auth.changeEmail")}</h2>
        {/* The confirmation goes to the *current* address — the server decides that.
            This is only where the link lands once the token is spent. */}
        <ChangeEmailForm account={account} callbackUrl="/settings/account" />
      </section>

      <section>
        <h2>{t("auth.sessions")}</h2>
        <ActiveSessionList account={account} />
      </section>
    </main>
  );
}

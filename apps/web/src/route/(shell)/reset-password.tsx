import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  Callout,
  type ClientNamespace,
  ResetPasswordForm,
  useMemo,
  useMessages,
  z,
} from "~/import.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

// Better Auth puts the token here when it redirects out of its own reset endpoint.
// Optional rather than required, because arriving without one is a real case — a
// bookmarked URL, or a link that has already been spent — and it deserves a sentence
// rather than a router error page.
const Search = z.object({ token: z.string().min(1).optional() });

export const Route = createFileRoute("/(shell)/reset-password")({
  validateSearch: Search,
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useMessages("auth");
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);

  // No session to invalidate: `revokeSessionsOnPasswordReset` is on, so every session
  // this user had is already gone by the time the mutation resolves. Sign-in is the
  // only place to go, and going there is the confirmation.
  const complete = () => void navigate({ to: "/sign-in" });

  return (
    <main>
      <h1>{t("auth.resetTitle")}</h1>
      {token ? (
        <ResetPasswordForm auth={auth} token={token} onSuccess={complete} />
      ) : (
        <>
          <Callout tone="danger">{t("auth.resetFailed")}</Callout>
          <Link to="/forgot-password">{t("auth.resetRequest")}</Link>
        </>
      )}
    </main>
  );
}

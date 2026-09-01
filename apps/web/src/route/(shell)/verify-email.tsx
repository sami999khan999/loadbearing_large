import { createFileRoute, Link } from "@tanstack/react-router";

import { Callout, type ClientNamespace, useMessages, z } from "~/import.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

// Where Better Auth sends the browser after it has consumed a verification token. On
// failure it appends `?error=…`; on success it appends nothing, which is why the
// absence of the parameter is what this page reads as "verified".
const Search = z.object({ error: z.string().optional() });

export const Route = createFileRoute("/(shell)/verify-email")({
  validateSearch: Search,
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useMessages("auth");
  const { error } = Route.useSearch();

  // The token is already spent by the time this renders — Better Auth's own endpoint
  // consumed it and redirected here. There is nothing to verify from the browser, which
  // is why this page holds no client and makes no request.
  return (
    <main>
      {error ? (
        <Callout tone="danger">{t("auth.verifyEmailFailed")}</Callout>
      ) : (
        <Callout tone="success">{t("auth.verifyEmailDone")}</Callout>
      )}
      {/* `autoSignInAfterVerification` is off: proving the mailbox was reachable is not
          proof that the person reading it is at this browser, so verification never
          issues a session and this link is the whole next step. */}
      <Link to="/sign-in">{t("auth.signIn")}</Link>
    </main>
  );
}

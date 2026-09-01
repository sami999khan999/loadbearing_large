import { createFileRoute, Link } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  type ClientNamespace,
  ForgotPasswordForm,
  useMemo,
  useMessages,
} from "~/import.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

export const Route = createFileRoute("/(shell)/forgot-password")({
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useMessages("auth");
  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);

  return (
    <main>
      {/* `/reset-password` is where Better Auth redirects the browser once it has spent
          the token from the email, carrying a fresh token on the query string. The path
          is `ROUTES.shell.resetPassword`, spelled again for the same reason every
          `createFileRoute` literal is. */}
      <ForgotPasswordForm auth={auth} resetUrl="/reset-password" />
      <Link to="/sign-in">{t("auth.signIn")}</Link>
    </main>
  );
}

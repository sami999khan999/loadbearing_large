import { createFileRoute, Link } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  type ClientNamespace,
  SignUpForm,
  SocialSignIn,
  useMemo,
  useMessages,
  useState,
  VerifyEmailNotice,
} from "~/import.js";

const MESSAGES = ["auth"] as const satisfies readonly ClientNamespace[];

export const Route = createFileRoute("/(shell)/sign-up")({
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: SignUpPage,
});

function SignUpPage() {
  const { t } = useMessages("auth");
  const { googleEnabled } = Route.useRouteContext();
  // Set once the form has submitted. The address is what the notice renders back, and
  // it only exists in the form that is about to be replaced — which is why this state
  // lives here rather than in either component.
  const [registered, setRegistered] = useState<string | null>(null);

  // Memoised because a bare `new` in the body builds a fresh Better Auth client, and a
  // fresh mutation identity, on every keystroke in the form (23).
  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);

  return (
    <main>
      {registered ? (
        <VerifyEmailNotice auth={auth} email={registered} verifyCallbackUrl="/verify-email" />
      ) : (
        <>
          {/* Google first. It is one click against a form with four fields, and a user
              who has an account there should not have to read the form to find out. */}
          <SocialSignIn
            auth={auth}
            enabled={googleEnabled}
            callbackUrl="/"
            errorCallbackUrl="/sign-in"
          />
          <SignUpForm auth={auth} verifyCallbackUrl="/verify-email" onSuccess={setRegistered} />
          <Link to="/sign-in">{t("auth.haveAccount")}</Link>
        </>
      )}
    </main>
  );
}

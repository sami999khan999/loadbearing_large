import { useMessages } from "../i18n/index.js";
import { type AuthClient, Button, Callout, SessionMutations } from "../import.js";

export interface SocialSignInProps {
  readonly auth: AuthClient;
  // False when the deployment configured no Google credentials. The flag is resolved
  // server-side and rides the session snapshot, because `Env` is server-only and a
  // button that leads to a provider nobody configured is worse than no button.
  readonly enabled: boolean;
  readonly callbackUrl: string;
  readonly errorCallbackUrl: string;
}

export function SocialSignIn({ auth, enabled, callbackUrl, errorCallbackUrl }: SocialSignInProps) {
  const { t } = useMessages("auth");
  const google = SessionMutations.useSignInWithGoogle(auth);

  if (!enabled) return null;

  return (
    <>
      {/* The normal outcome is a full-page navigation to Google, so this branch is only
          reached when the redirect never happened — a misconfigured client id rather
          than anything the visitor did. */}
      {google.isError ? <Callout tone="danger">{t("auth.socialFailed")}</Callout> : null}

      <Button
        variant="secondary"
        disabled={google.isPending}
        onClick={() =>
          google.mutate({ callbackURL: callbackUrl, errorCallbackURL: errorCallbackUrl })
        }
      >
        {t("auth.continueWithGoogle")}
      </Button>

      <p className="ui-field__hint">{t("auth.orDivider")}</p>
    </>
  );
}

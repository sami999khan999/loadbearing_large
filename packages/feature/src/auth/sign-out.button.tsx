import { useMessages } from "../i18n/index.js";
import { type AuthClient, Button, SessionMutations } from "../import.js";

export interface SignOutButtonProps {
  readonly auth: AuthClient;
  // Runs after the cookie is gone. The call site clears the cache and navigates, because
  // that is a lifecycle decision this component cannot make.
  readonly onSignedOut: () => void;
}

export function SignOutButton({ auth, onSignedOut }: SignOutButtonProps) {
  const { t } = useMessages("auth");
  const signOut = SessionMutations.useSignOut(auth, onSignedOut);

  return (
    <Button variant="ghost" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
      {t("auth.signOut")}
    </Button>
  );
}

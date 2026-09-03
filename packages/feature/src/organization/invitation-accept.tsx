import { useSession } from "../auth/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  ErrorNormalizer,
  type OrganizationClient,
  OrganizationMutations,
} from "../import.js";

// What the landing page knows before anyone is signed in. The same three fields the
// server function returns from `InvitationClaimer.preview`.
export interface InvitationPreview {
  readonly organizationName: string;
  readonly email: string;
  readonly expired: boolean;
}

export interface InvitationAcceptProps {
  readonly preview: InvitationPreview | null;
  readonly token: string;
  readonly organization: OrganizationClient;
  readonly onAccepted: () => void;
  // Callbacks rather than hrefs, because `feature` may not import routing — and the
  // sign-in one has to carry a redirect back here, which only the app knows how to spell.
  readonly onSignIn: () => void;
  readonly onSignUp: () => void;
}

// One component, four states, decided in order: no such invitation, expired, nobody
// signed in, the wrong person signed in — and only then the button. The order matters
// because each earlier state makes the later question moot.
//
// The email comparison here is a courtesy. The claimer compares the *verified* address
// on the server, and a mismatch there is refused whether or not this rendered a button.
export function InvitationAccept({
  preview,
  token,
  organization,
  onAccepted,
  onSignIn,
  onSignUp,
}: InvitationAcceptProps) {
  const { t } = useMessages("organization");
  const shell = useMessages("common");
  const { user } = useSession();
  const accept = OrganizationMutations.useAcceptInvitation(organization, onAccepted);

  if (!preview) return <Callout tone="danger">{t("organization.invitation.missing")}</Callout>;

  const params = { organization: preview.organizationName, email: preview.email };

  if (preview.expired) {
    return <Callout tone="warning">{t("organization.invitation.expired", params)}</Callout>;
  }

  if (!user) {
    return (
      <>
        <p>{t("organization.invitation.intro", params)}</p>
        <Button onClick={onSignUp}>{t("organization.invitation.signUp", params)}</Button>{" "}
        <Button variant="secondary" onClick={onSignIn}>
          {t("organization.invitation.signIn", params)}
        </Button>
      </>
    );
  }

  if (user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <Callout tone="warning">
        {t("organization.invitation.wrongAccount", { ...params, current: user.email })}
      </Callout>
    );
  }

  // The server said no after the page said yes — revoked between the two, most likely.
  // Everything the server refuses arrives as NOT_FOUND, and that copy already exists.
  const failure = accept.error ? ErrorNormalizer.normalize(accept.error) : null;
  const failureCopy =
    failure?.code === "NOT_FOUND" ? t("organization.invitation.missing") : shell.t("state.error");

  return (
    <>
      <p>{t("organization.invitation.intro", params)}</p>
      {failure ? <Callout tone="danger">{failureCopy}</Callout> : null}
      <Button disabled={accept.isPending} onClick={() => accept.mutate({ token })}>
        {t("organization.invitation.accept", params)}
      </Button>
    </>
  );
}

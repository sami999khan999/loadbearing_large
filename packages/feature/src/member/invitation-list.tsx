import { useCapabilities } from "../auth/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Can,
  EmptyState,
  type InvitationDto,
  MemberMutations,
  MemberQueries,
  useApiClient,
  useAppQuery,
} from "../import.js";

export interface InvitationListProps {
  readonly limit?: number;
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

// Hiding the revoke button is a courtesy: the use-case asserts the same key, so a
// request without it is FORBIDDEN whether or not the button rendered.
export function InvitationList({ limit = 25 }: InvitationListProps) {
  const { t } = useMessages("member");
  const client = useApiClient();
  const capabilities = useCapabilities();
  const invitations = useAppQuery(MemberQueries.invitations(client, { limit, offset: 0 }));
  const revoke = MemberMutations.useRevokeInvitation(client);

  // Annotated rather than inferred: the client's procedure types are reconstructed
  // through two packages, and a break anywhere degrades to `any` silently.
  const rows: readonly InvitationDto[] = invitations.data?.items ?? [];

  if (invitations.isPending) return null;
  if (rows.length === 0) return <EmptyState title={t("member.invitation.empty")} />;

  return (
    <ul>
      {rows.map((invitation) => (
        <li key={invitation.id}>
          <span>{invitation.email}</span> <span>{invitation.roleName}</span>{" "}
          <small>
            {t("member.invitation.invitedBy", { name: invitation.inviterName })} ·{" "}
            {t("member.invitation.expires", { date: day(invitation.expiresAt) })}
          </small>{" "}
          <Can permission="member.invite" capabilities={capabilities}>
            <Button
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate({ invitationId: invitation.id })}
            >
              {t("member.invitation.revoke")}
            </Button>
          </Can>
        </li>
      ))}
    </ul>
  );
}

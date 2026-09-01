import { useMessages } from "../i18n/index.js";
import {
  type AccountClient,
  AccountMutations,
  AccountQueries,
  Button,
  Callout,
  StatusBadge,
  useAppQuery,
} from "../import.js";

export interface ActiveSessionListProps {
  readonly account: AccountClient;
}

export function ActiveSessionList({ account }: ActiveSessionListProps) {
  const { t } = useMessages("auth");
  const sessions = useAppQuery(AccountQueries.sessions(account));

  const revoke = AccountMutations.useRevokeSession(account);
  const revokeOthers = AccountMutations.useRevokeOtherSessions(account);

  const rows = sessions.data ?? [];

  return (
    <>
      <ul>
        {rows.map((session) => (
          <li key={session.id}>
            {/* The user agent, unparsed. Turning it into "Chrome on macOS" needs a
                lookup table that is wrong for every browser released after it shipped,
                and the raw string is what someone recognising their own device reads. */}
            <span>{session.userAgent ?? session.ipAddress ?? session.id}</span>

            <Button
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate({ token: session.token })}
            >
              {t("auth.sessionRevoke")}
            </Button>
          </li>
        ))}
      </ul>

      {revokeOthers.isSuccess ? (
        <Callout tone="success">{t("auth.signOutEverywhereDone")}</Callout>
      ) : null}

      {/* Every session but this one, so the page you are reading stays usable. The copy
          deliberately does not promise immediacy: a desktop session is revoked when it
          next connects, and the cookie cache holds for up to a minute regardless (16.9). */}
      <Button
        variant="danger"
        disabled={revokeOthers.isPending}
        onClick={() => revokeOthers.mutate()}
      >
        {t("auth.signOutEverywhere")}
      </Button>

      <StatusBadge tone="neutral">{t("auth.sessionCurrent")}</StatusBadge>
    </>
  );
}

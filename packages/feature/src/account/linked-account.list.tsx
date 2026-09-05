import { useMessages } from "../i18n/index.js";
import {
  type AccountClient,
  AccountMutations,
  AccountQueries,
  Button,
  Callout,
  EmptyState,
  StatusBadge,
  useAppQuery,
} from "../import.js";

// Better Auth's own id for the email-and-password provider. It is a linked account like
// any other in this table, which is why unlinking has to count rather than filter.
const CREDENTIAL = "credential";

export interface LinkedAccountListProps {
  readonly account: AccountClient;
  readonly googleEnabled: boolean;
  readonly linkCallbackUrl: string;
}

export function LinkedAccountList({
  account,
  googleEnabled,
  linkCallbackUrl,
}: LinkedAccountListProps) {
  const { t } = useMessages("auth");
  // `common` for the states every list shares, `auth` for this screen's own copy.
  const shell = useMessages("common");
  const accounts = useAppQuery(AccountQueries.linkedAccounts(account));

  const unlink = AccountMutations.useUnlinkAccount(account);
  const link = AccountMutations.useLinkGoogle(account);

  const linked = accounts.data ?? [];
  // The last credential must not be removable. Better Auth's `allowUnlinkingAll` is the
  // backstop; this is the half that can explain itself.
  const isLast = linked.length <= 1;
  const hasGoogle = linked.some((entry) => entry.providerId === "google");

  // Pending before empty: `data` is undefined until the first answer, so the empty state
  // rendered for every account while the request was still in flight.
  if (accounts.isPending) return <EmptyState title={shell.t("state.loading")} />;
  if (accounts.isError) return <Callout tone="danger">{shell.t("state.error")}</Callout>;

  if (linked.length === 0) {
    return (
      <EmptyState title={t("auth.linkedAccounts")} description={t("auth.linkedAccountsHint")} />
    );
  }

  return (
    <>
      <p className="ui-field__hint">{t("auth.linkedAccountsHint")}</p>

      <ul>
        {linked.map((entry) => (
          <li key={entry.id}>
            <StatusBadge tone={entry.providerId === CREDENTIAL ? "neutral" : "accent"}>
              {entry.providerId}
            </StatusBadge>

            {isLast ? (
              <span className="ui-field__hint">{t("auth.unlinkLast")}</span>
            ) : (
              <Button
                variant="ghost"
                disabled={unlink.isPending}
                onClick={() =>
                  unlink.mutate({ providerId: entry.providerId, accountId: entry.accountId })
                }
              >
                {t("auth.unlink")}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {
        // Only when the deployment configured Google and this account has not linked one.
      }
      {googleEnabled && !hasGoogle ? (
        <Button
          variant="secondary"
          disabled={link.isPending}
          onClick={() => link.mutate({ callbackURL: linkCallbackUrl })}
        >
          {t("auth.linkGoogle")}
        </Button>
      ) : null}

      {unlink.isError ? <Callout tone="danger">{t("auth.socialFailed")}</Callout> : null}
    </>
  );
}

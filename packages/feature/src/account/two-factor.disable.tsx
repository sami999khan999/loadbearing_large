import { useMessages } from "../i18n/index.js";
import {
  type AccountClient,
  AccountMutations,
  Button,
  Callout,
  CodeList,
  Field,
  type FormEvent,
  Input,
  useState,
} from "../import.js";

export interface TwoFactorPanelProps {
  readonly account: AccountClient;
}

// Turning two-factor off, or replacing the backup codes. Both take the password: a
// stolen session must not remove the factor protecting the account.
export function TwoFactorPanel({ account }: TwoFactorPanelProps) {
  const { t } = useMessages("auth");
  const [password, setPassword] = useState("");
  const [fresh, setFresh] = useState<readonly string[]>([]);

  const disable = AccountMutations.useDisableTwoFactor(account);
  const regenerate = AccountMutations.useRegenerateBackupCodes(account);

  const pending = disable.isPending || regenerate.isPending;

  const spend = (event: FormEvent) => {
    event.preventDefault();
    disable.mutate({ password }, { onSuccess: () => setPassword("") });
  };

  return (
    <form onSubmit={spend} noValidate>
      <Callout tone="success">{t("auth.twoFactorOn")}</Callout>

      <Field label={t("auth.twoFactorConfirmPassword")} htmlFor="disable-password">
        <Input
          id="disable-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>

      {disable.isError || regenerate.isError ? (
        <Callout tone="danger">{t("auth.changePasswordFailed")}</Callout>
      ) : null}

      {
        // The new codes replace every previous one, which is the point rather than a
        // side effect.
      }
      {regenerate.isSuccess ? (
        <>
          <Callout tone="warning" title={t("auth.backupCodesRegenerated")}>
            {t("auth.backupCodesHint")}
          </Callout>
          <CodeList values={fresh} label={t("auth.backupCodes")} />
        </>
      ) : null}

      <Button
        variant="secondary"
        disabled={pending || password.length === 0}
        onClick={() =>
          regenerate.mutate(
            { password },
            {
              onSuccess: (codes) => {
                setFresh(codes);
                setPassword("");
              },
            },
          )
        }
      >
        {t("auth.backupCodesRegenerate")}
      </Button>

      <Button type="submit" variant="danger" disabled={pending || password.length === 0}>
        {t("auth.twoFactorDisable")}
      </Button>
    </form>
  );
}

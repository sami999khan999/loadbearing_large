import { useMessages } from "../i18n/index.js";
import {
  type AccountClient,
  AccountMutations,
  Button,
  Callout,
  Field,
  type FormEvent,
  Input,
  useState,
} from "../import.js";

const MIN_PASSWORD_LENGTH = 12;

export interface ChangePasswordFormProps {
  readonly account: AccountClient;
}

export function ChangePasswordForm({ account }: ChangePasswordFormProps) {
  const { t } = useMessages("auth");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const change = AccountMutations.useChangePassword(account);

  const mismatch = confirmation.length > 0 && confirmation !== next;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mismatch || tooShort) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        // Cleared on success, not left filled. A settings page that keeps three
        // populated password fields after a save is one stray click from re-submitting.
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirmation("");
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.currentPassword")} htmlFor="current-password">
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </Field>

      <Field
        label={t("auth.resetNewPassword")}
        htmlFor="new-password"
        error={tooShort ? t("auth.passwordTooShort") : undefined}
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
      </Field>

      <Field
        label={t("auth.confirmPassword")}
        htmlFor="new-password-confirmation"
        error={mismatch ? t("auth.passwordMismatch") : undefined}
      >
        <Input
          id="new-password-confirmation"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </Field>

      {
        // The copy says other devices were signed out because they were:
        // `revokeOtherSessions` is set on the call.
      }
      {change.isSuccess ? <Callout tone="success">{t("auth.changePasswordDone")}</Callout> : null}
      {change.isError ? <Callout tone="danger">{t("auth.changePasswordFailed")}</Callout> : null}

      <Button type="submit" disabled={change.isPending || mismatch || tooShort}>
        {t("auth.changePassword")}
      </Button>
    </form>
  );
}

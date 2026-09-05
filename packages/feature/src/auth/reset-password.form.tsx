import { useMessages } from "../i18n/index.js";
import {
  type AuthClient,
  Button,
  Callout,
  Field,
  type FormEvent,
  Input,
  SessionMutations,
  useState,
} from "../import.js";

// The same floor `SignUpForm` and `AuthFactory` state.
const MIN_PASSWORD_LENGTH = 12;

export interface ResetPasswordFormProps {
  readonly auth: AuthClient;
  // Off the query string, put there by Better Auth's own redirect. The route validates
  // its presence; this component treats it as opaque and never inspects it.
  readonly token: string;
  readonly onSuccess: () => void;
}

export function ResetPasswordForm({ auth, token, onSuccess }: ResetPasswordFormProps) {
  const { t } = useMessages("auth");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const reset = SessionMutations.useResetPassword(auth);

  const mismatch = confirmation.length > 0 && confirmation !== password;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mismatch || tooShort) return;
    reset.mutate({ token, newPassword: password }, { onSuccess });
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label={t("auth.resetNewPassword")}
        htmlFor="password"
        error={tooShort ? t("auth.passwordTooShort") : undefined}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>

      <Field
        label={t("auth.confirmPassword")}
        htmlFor="confirmation"
        error={mismatch ? t("auth.passwordMismatch") : undefined}
      >
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </Field>

      {
        // One message for expired and already-spent alike: both mean "ask for another".
      }
      {reset.isError ? <Callout tone="danger">{t("auth.resetFailed")}</Callout> : null}

      <Button type="submit" disabled={reset.isPending || mismatch || tooShort}>
        {t("auth.resetSubmit")}
      </Button>
    </form>
  );
}

import { useMessages } from "../i18n/index.js";
import { type AuthClient, Button, Field, type FormEvent, Input, useState } from "../import.js";

export interface TwoFactorFormProps {
  readonly auth: AuthClient;
  readonly onSuccess: () => void;
}

// The second leg of a sign-in that answered `TWO_FACTOR_REQUIRED`. Doc 23 names this
// component and specifies no body; the shape below mirrors `SignInForm` deliberately,
// because the two are halves of one flow and a reader should not have to learn a second
// pattern to follow it.
export function TwoFactorForm({ auth, onSuccess }: TwoFactorFormProps) {
  const { t } = useMessages("auth");
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  // Not a `SessionMutations` entry: verifying a code does not invalidate the session
  // query, because there is no session yet — `onSuccess` is what navigates, and the
  // session query runs on the route that lands.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailed(false);
    setPending(true);

    auth
      .verifyTwoFactor(code)
      .then(onSuccess)
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.twoFactorCode")} htmlFor="code" hint={t("auth.twoFactorHint")}>
        <Input
          id="code"
          // `one-time-code` is what lets a phone offer the SMS or authenticator code,
          // and `inputMode` is what gives a numeric keypad rather than a full keyboard.
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      </Field>

      {failed ? (
        <p role="alert" className="ui-field__error">
          {t("auth.signInFailed")}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || code.length === 0}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}

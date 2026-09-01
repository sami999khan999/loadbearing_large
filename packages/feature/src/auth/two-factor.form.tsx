import { useMessages } from "../i18n/index.js";
import {
  type AuthClient,
  Button,
  Callout,
  Field,
  type FormEvent,
  Input,
  useState,
} from "../import.js";

// The three ways to finish a sign-in that answered `TWO_FACTOR_REQUIRED`. Alternatives,
// not a sequence: the authenticator app, a backup code for the phone that is gone, or a
// mailed code for the phone that is merely elsewhere.
type Method = "totp" | "backup" | "otp";

export interface TwoFactorFormProps {
  readonly auth: AuthClient;
  readonly onSuccess: () => void;
}

export function TwoFactorForm({ auth, onSuccess }: TwoFactorFormProps) {
  const { t } = useMessages("auth");
  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Plain promises rather than `useAppMutation`, as this form has always done: there is
  // no session query to invalidate yet — the session does not exist until this succeeds,
  // and the route's `complete()` is what refetches it.
  const run = (work: Promise<void>, after?: () => void) => {
    setFailed(false);
    setPending(true);
    work
      .then(after ?? onSuccess)
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (method === "backup") return run(auth.verifyBackupCode(code));
    if (method === "otp") return run(auth.verifyTwoFactorOtp(code));
    return run(auth.verifyTwoFactor(code));
  };

  // Switching method clears the code. Carrying a half-typed six-digit TOTP into the
  // backup-code field submits something guaranteed to fail and burns a rate-limit slot.
  const switchTo = (next: Method) => {
    setMethod(next);
    setCode("");
    setFailed(false);
  };

  const backup = method === "backup";

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label={backup ? t("auth.twoFactorBackupCode") : t("auth.twoFactorCode")}
        htmlFor="code"
        hint={backup ? t("auth.twoFactorBackupHint") : t("auth.twoFactorHint")}
      >
        <Input
          id="code"
          autoComplete="one-time-code"
          // A backup code is alphanumeric and longer; only the two numeric methods get
          // the numeric keypad and the six-character ceiling.
          inputMode={backup ? "text" : "numeric"}
          pattern={backup ? undefined : "[0-9]*"}
          maxLength={backup ? 24 : 6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      </Field>

      {otpSent ? <Callout tone="info">{t("auth.twoFactorOtpSent")}</Callout> : null}

      {failed ? (
        <p role="alert" className="ui-field__error">
          {t("auth.twoFactorFailed")}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || code.length === 0}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>

      {/* The way out for someone who cannot produce the factor they enrolled. Both
          alternatives stay reachable from every method, so there is no order to get
          stuck in. */}
      {method === "totp" ? (
        <Button variant="ghost" onClick={() => switchTo("backup")}>
          {t("auth.twoFactorUseBackup")}
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => switchTo("totp")}>
          {t("auth.twoFactorUseTotp")}
        </Button>
      )}

      {method === "otp" ? null : (
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(auth.sendTwoFactorOtp(), () => {
              switchTo("otp");
              setOtpSent(true);
            })
          }
        >
          {t("auth.twoFactorUseOtp")}
        </Button>
      )}
    </form>
  );
}

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
// not a sequence.
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

  // Plain promises rather than `useAppMutation`: there is no session to invalidate until
  // this succeeds, and the route's `complete()` is what refetches it.
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

  // Switching method clears the code: a half-typed TOTP carried into the backup-code
  // field submits a guaranteed failure and burns a rate-limit slot.
  const switchTo = (next: Method) => {
    setMethod(next);
    setCode("");
    setFailed(false);
    // The "we sent you a code" notice belongs to the OTP leg. The caller that switches
    // *to* OTP sets it back in the same handler.
    setOtpSent(false);
  };

  const backup = method === "backup";

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label={backup ? t("auth.twoFactorBackupCode") : t("auth.twoFactorCode")}
        htmlFor="two-factor-code"
        hint={backup ? t("auth.twoFactorBackupHint") : t("auth.twoFactorHint")}
      >
        <Input
          id="two-factor-code"
          autoComplete="one-time-code"
          // A backup code is alphanumeric and longer, so only the numeric methods get the
          // keypad and the six-character ceiling.
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

      {
        // One button per method that is not the current one. A ternary on `totp` left
        // backup codes unreachable from the emailed one-time code.
      }
      {method === "totp" ? null : (
        <Button variant="ghost" onClick={() => switchTo("totp")}>
          {t("auth.twoFactorUseTotp")}
        </Button>
      )}

      {method === "backup" ? null : (
        <Button variant="ghost" onClick={() => switchTo("backup")}>
          {t("auth.twoFactorUseBackup")}
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

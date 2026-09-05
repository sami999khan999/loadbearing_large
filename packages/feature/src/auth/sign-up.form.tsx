import { useMessages } from "../i18n/index.js";
import {
  type AuthClient,
  Button,
  ErrorNormalizer,
  Field,
  type FormEvent,
  Input,
  SessionMutations,
  useState,
} from "../import.js";

// Kept in step with `minPasswordLength` in `AuthFactory`. Checked here too, because a
// rejected sign-up that clears the form is a worse way to learn it.
const MIN_PASSWORD_LENGTH = 12;

export interface SignUpFormProps {
  // A prop, not a module import. The instance differs per environment, and a module
  // singleton in an SSR bundle is shared across requests.
  readonly auth: AuthClient;
  // Where the link in the verification email should land. The app owns its own routes,
  // so this package is told rather than deciding.
  readonly verifyCallbackUrl: string;
  // Handed the address: the next screen renders it back, and this form is about to stop
  // existing.
  readonly onSuccess: (email: string) => void;
}

export function SignUpForm({ auth, verifyCallbackUrl, onSuccess }: SignUpFormProps) {
  const { t } = useMessages("auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const signUp = SessionMutations.useSignUp(auth);

  // Derived, not state: a validity flag stored beside its own inputs gets out of step for
  // one render.
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  // Branch on the code, never the message: matching prose is already broken in every
  // locale but English.
  const failure = signUp.isError ? ErrorNormalizer.normalize(signUp.error).code : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mismatch || tooShort) return;

    signUp.mutate(
      { name, email, password, callbackURL: verifyCallbackUrl },
      { onSuccess: () => onSuccess(email) },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.name")} htmlFor="name">
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>

      <Field label={t("auth.email")} htmlFor="email">
        <Input
          id="email"
          type="email"
          // What password managers key on: omitting it is a usability cost for users who
          // will not report it.
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>

      <Field
        label={t("auth.password")}
        htmlFor="password"
        error={tooShort ? t("auth.passwordTooShort") : undefined}
      >
        <Input
          id="password"
          type="password"
          // `new-password`, not `current-password`: it tells a password manager to offer
          // to generate one rather than fill the old one in.
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
        // The one flow that cannot hide whether an address is registered: the
        // alternative claims an account was created when it was not.
      }
      {failure ? (
        <p role="alert" className="ui-field__error">
          {failure === "CONFLICT" ? t("auth.emailTaken") : t("auth.signUpFailed")}
        </p>
      ) : null}

      <Button type="submit" disabled={signUp.isPending || mismatch || tooShort}>
        {signUp.isPending ? t("auth.signingUp") : t("auth.signUp")}
      </Button>
    </form>
  );
}

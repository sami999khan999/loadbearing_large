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

export interface SignInFormProps {
  // A prop, not a module import. The instance differs per environment, and a module
  // singleton in an SSR bundle is shared across requests.
  readonly auth: AuthClient;
  readonly onSuccess: () => void;
  readonly onNeedsTwoFactor?: () => void;
}

export function SignInForm({ auth, onSuccess, onNeedsTwoFactor }: SignInFormProps) {
  const { t } = useMessages("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Distinct from `signIn.isError`, and it has to be: the second-factor fork arrives as
  // a rejection so that both legs share one path, but it is not a failed sign-in and
  // must not render "sign-in failed" underneath the form that is about to be replaced.
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  const signIn = SessionMutations.useSignIn(auth);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNeedsTwoFactor(false);
    signIn.mutate(
      { email, password },
      {
        onSuccess: () => onSuccess(),
        // Branch on the code, never the message. `error.message` is the code and
        // nothing else (09) — and matching prose would break the moment someone
        // rewords it, and is already broken in every locale but English.
        onError: (error) => {
          if (ErrorNormalizer.normalize(error).code === "TWO_FACTOR_REQUIRED") {
            setNeedsTwoFactor(true);
            onNeedsTwoFactor?.();
          }
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.email")} htmlFor="email">
        <Input
          id="email"
          type="email"
          // What password managers key on. Omitting it is a real usability cost for a
          // class of users who will not report it.
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>

      <Field label={t("auth.password")} htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>

      {/* Deliberately generic — never "no account with that email" or "incorrect
          password". Distinguishing them is an account-enumeration oracle. */}
      {signIn.isError && !needsTwoFactor ? (
        <p role="alert" className="ui-field__error">
          {t("auth.signInFailed")}
        </p>
      ) : null}

      <Button type="submit" disabled={signIn.isPending}>
        {signIn.isPending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}

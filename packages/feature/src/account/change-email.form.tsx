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

export interface ChangeEmailFormProps {
  readonly account: AccountClient;
  // Where the confirmation link lands. It goes to the *current* address, which the
  // server decides — this is only the destination once the token is spent.
  readonly callbackUrl: string;
}

export function ChangeEmailForm({ account, callbackUrl }: ChangeEmailFormProps) {
  const { t } = useMessages("auth");
  const [newEmail, setNewEmail] = useState("");

  const change = AccountMutations.useChangeEmail(account);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate({ newEmail, callbackURL: callbackUrl });
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.newEmail")} htmlFor="new-email">
        <Input
          id="new-email"
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          required
        />
      </Field>

      {
        // Nothing has changed yet: a "saved" message here would be a lie until the link
        // in the old inbox is followed.
      }
      {change.isSuccess ? <Callout tone="info">{t("auth.changeEmailSent")}</Callout> : null}

      <Button type="submit" disabled={change.isPending}>
        {t("auth.changeEmail")}
      </Button>
    </form>
  );
}

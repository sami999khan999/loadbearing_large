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

export interface ProfileFormProps {
  readonly account: AccountClient;
  readonly currentName: string;
}

export function ProfileForm({ account, currentName }: ProfileFormProps) {
  const { t } = useMessages("auth");
  // Seeded once from the session, then owned by this component. Re-syncing it to the
  // prop on every render would discard what the user is typing the moment the session
  // query refetches underneath them.
  const [name, setName] = useState(currentName);

  const update = AccountMutations.useUpdateName(account);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ name });
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("auth.name")} htmlFor="profile-name">
        <Input
          id="profile-name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>

      {update.isSuccess ? <Callout tone="success">{t("auth.saved")}</Callout> : null}

      <Button type="submit" disabled={update.isPending || name === currentName}>
        {t("auth.saveChanges")}
      </Button>
    </form>
  );
}

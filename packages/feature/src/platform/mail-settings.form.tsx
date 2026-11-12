import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  Field,
  Input,
  type MailSettingsDto,
  type OrganizationId,
  PlatformMutations,
  PlatformQueries,
  Select,
  useApiClient,
  useAppQuery,
  useEffect,
  useState,
} from "../import.js";

export interface MailSettingsFormProps {
  // The platform organization's row is the platform default; any other is an override.
  readonly defaultOrganizationId?: string;
}

type Saved = MailSettingsDto["settings"];

// One organization's mail server (`26.11`). Sign-in mail never uses a tenant's, and the
// password is write-only: an empty field keeps it, and nothing ever shows it.
export function MailSettingsForm({ defaultOrganizationId = "" }: MailSettingsFormProps) {
  const { t } = useMessages("platform");
  const describe = useErrorMessage();
  const client = useApiClient();
  const [organization, setOrganization] = useState(defaultOrganizationId);
  const organizationId = organization.trim() as OrganizationId;
  const ready = organizationId.length === 36;

  const current = useAppQuery({
    ...PlatformQueries.mailSettings(client, organizationId),
    enabled: ready,
  });
  const save = PlatformMutations.useSaveMailSettings(client);
  const remove = PlatformMutations.useRemoveMailSettings(client);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [fromAddress, setFromAddress] = useState("");

  // The form follows the row it is editing, and starts blank for an organization with none.
  const saved: Saved = current.data?.settings ?? null;
  useEffect(() => {
    setHost(saved?.host ?? "");
    setPort(String(saved?.port ?? 587));
    setSecurity(saved?.secure ? "tls" : "starttls");
    setUsername(saved?.username ?? "");
    setPassword("");
    setClearPassword(false);
    setFromAddress(saved?.fromAddress ?? "");
  }, [saved]);

  const portNumber = Number(port);
  const valid =
    ready && host.trim() !== "" && fromAddress.trim() !== "" && Number.isInteger(portNumber);

  return (
    <section>
      <h2>{t("platform.mail.settings.title")}</h2>
      <p>{t("platform.mail.settings.description")}</p>
      <Field label={t("platform.mail.filter.organization")} htmlFor="mail-settings-organization">
        <Input
          id="mail-settings-organization"
          value={organization}
          onChange={(event) => setOrganization(event.target.value)}
        />
      </Field>

      {current.isError ? <Callout tone="danger">{describe(current.error)?.message}</Callout> : null}
      {current.isSuccess && !current.data.canStorePasswords ? (
        <Callout tone="warning">{t("platform.mail.settings.noKey")}</Callout>
      ) : null}
      {current.isSuccess ? (
        <p className="text-fg-muted">
          {saved ? t("platform.mail.settings.configured") : t("platform.mail.settings.fallback")}
        </p>
      ) : null}

      <Field label={t("platform.mail.settings.host")} htmlFor="mail-settings-host">
        <Input
          id="mail-settings-host"
          value={host}
          onChange={(event) => setHost(event.target.value)}
        />
      </Field>
      <Field label={t("platform.mail.settings.port")} htmlFor="mail-settings-port">
        <Input
          id="mail-settings-port"
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(event) => setPort(event.target.value)}
        />
      </Field>
      <Field label={t("platform.mail.settings.security")} htmlFor="mail-settings-security">
        <Select
          id="mail-settings-security"
          label={t("platform.mail.settings.security")}
          value={security}
          onValueChange={setSecurity}
          options={[
            { value: "starttls", label: t("platform.mail.settings.starttls") },
            { value: "tls", label: t("platform.mail.settings.tls") },
          ]}
        />
      </Field>
      <Field label={t("platform.mail.settings.username")} htmlFor="mail-settings-username">
        <Input
          id="mail-settings-username"
          autoComplete="off"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>
      <Field
        label={t("platform.mail.settings.password")}
        htmlFor="mail-settings-password"
        hint={saved?.hasPassword ? t("platform.mail.settings.passwordKept") : undefined}
      >
        <Input
          id="mail-settings-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setClearPassword(false);
          }}
        />
      </Field>
      {saved?.hasPassword ? (
        <Button
          variant="secondary"
          aria-pressed={clearPassword}
          onClick={() => setClearPassword(!clearPassword)}
        >
          {clearPassword
            ? t("platform.mail.settings.keepPassword")
            : t("platform.mail.settings.clearPassword")}
        </Button>
      ) : null}
      <Field label={t("platform.mail.settings.from")} htmlFor="mail-settings-from">
        <Input
          id="mail-settings-from"
          value={fromAddress}
          onChange={(event) => setFromAddress(event.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button
          disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate({
              organizationId,
              host,
              port: portNumber,
              secure: security === "tls",
              username: username.trim() || null,
              ...(clearPassword ? { password: null } : password ? { password } : {}),
              fromAddress,
            })
          }
        >
          {t("platform.mail.settings.save")}
        </Button>
        {saved ? (
          <Button
            variant="secondary"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ organizationId })}
          >
            {t("platform.mail.settings.remove")}
          </Button>
        ) : null}
      </div>
      {save.isError ? <Callout tone="danger">{describe(save.error)?.message}</Callout> : null}
      {save.isSuccess ? (
        <Callout tone="success">{t("platform.mail.settings.saved")}</Callout>
      ) : null}
    </section>
  );
}

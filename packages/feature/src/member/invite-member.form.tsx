import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  ErrorNormalizer,
  Field,
  type FormEvent,
  Input,
  MemberMutations,
  type RoleDto,
  RoleQueries,
  useApiClient,
  useAppQuery,
  useState,
} from "../import.js";

// The roles come from the same query the roles page reads, so a role created there is
// offered here with no second list.
export function InviteMemberForm() {
  const { t } = useMessages("member");
  const shell = useMessages("common");
  const client = useApiClient();
  const roles = useAppQuery(RoleQueries.list(client, { limit: 100, offset: 0 }));
  const invite = MemberMutations.useInvite(client);

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  // Annotated rather than inferred: the client's procedure types are reconstructed
  // through two packages, and a break anywhere degrades to `any` silently.
  const options: readonly RoleDto[] = roles.data?.items ?? [];
  // `member` by default, never `owner`: the wildcard role should be a deliberate pick.
  // The first option and not `""`, so the value equals what the select paints.
  const fallback = options.find((role) => role.key === "member")?.id ?? options[0]?.id ?? "";
  // And the stored id counts only while it is still on offer, so a role that goes away
  // between renders cannot be submitted from a select that stopped painting it.
  const selectedRole = options.some((role) => role.id === roleId) ? roleId : fallback;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedRole) return;
    invite.mutate(
      { email, roleId: selectedRole as RoleDto["id"] },
      // Both fields, not just the address: the next invitation is a fresh decision, and
      // a role left selected is the previous one made silently.
      {
        onSuccess: () => {
          setEmail("");
          setRoleId("");
        },
      },
    );
  };

  // The one failure that deserves its own sentence; everything else uses the catalog's.
  const failure = invite.error ? ErrorNormalizer.normalize(invite.error) : null;
  const failureCopy =
    failure?.code === "CONFLICT" ? t("member.invite.alreadyMember") : shell.t("state.error");

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t("member.invite.email")} htmlFor="invite-email">
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>

      <Field label={t("member.invite.role")} htmlFor="invite-role">
        {
          // A native select styled as an input: the design system has no select yet.
        }
        <select
          id="invite-role"
          className="ui-input"
          value={selectedRole}
          onChange={(event) => setRoleId(event.target.value)}
          disabled={roles.isPending}
        >
          {options.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </Field>

      {invite.isSuccess ? (
        <Callout tone="success">{t("member.invite.sent", { email: invite.data.email })}</Callout>
      ) : null}
      {failure ? <Callout tone="danger">{failureCopy}</Callout> : null}

      <Button type="submit" disabled={invite.isPending || !selectedRole}>
        {t("member.invite.submit")}
      </Button>
    </form>
  );
}

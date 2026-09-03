import { createFileRoute } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  InvitationList,
  InviteMemberForm,
  MemberList,
  useCapabilities,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

// `member` for this page's own copy; `role` because the invite form's role picker reads
// `RoleQueries.list`, and a role name arriving with no namespace loaded renders raw.
const MESSAGES = ["member", "role"] as const satisfies readonly ClientNamespace[];

// Behind `member.read`, which `owner`, `admin` and `member` all hold in `SystemRoleSeed`
// — the same key `member.list` is gated on in `PROCEDURE_PERMISSIONS` and the same key
// `ListMembersUseCase` asserts. The invite form and the revoke buttons are behind
// `member.invite` separately, which `member` does not hold: a member sees the list and
// nothing they cannot do.
//
// The path is `ROUTES.rbac.members`, spelled again because `createFileRoute()` takes a
// literal the generator reads without executing the file.
export const Route = createFileRoute("/(app)/_authenticated/settings/members")({
  beforeLoad: RouteGuard.requirePermission("member.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Members,
});

function Members() {
  const { t } = useMessages("member");
  const capabilities = useCapabilities();

  return (
    <main>
      <h1>{t("member.title")}</h1>
      <p>{t("member.subtitle")}</p>
      <MemberList />

      <h2>{t("member.invitation.title")}</h2>
      <InvitationList />

      <Can permission="member.invite" capabilities={capabilities}>
        <h2>{t("member.invite.title")}</h2>
        <InviteMemberForm />
      </Can>
    </main>
  );
}

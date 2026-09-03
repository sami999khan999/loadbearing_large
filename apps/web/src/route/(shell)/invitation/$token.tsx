import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Endpoint } from "~/endpoint.js";
import {
  AuthClient,
  type ClientNamespace,
  InvitationAccept,
  OrganizationClient,
  useMemo,
  useMessages,
} from "~/import.js";
import { fetchInvitation } from "~/server/invitation.fn.js";

const MESSAGES = ["organization", "auth"] as const satisfies readonly ClientNamespace[];

// Where the link in an invitation mail lands. Under `(shell)` because the person holding
// it may have no account yet, and the page has to make sense to them too.
//
// The path is `ROUTES.shell.invitation` plus the token, spelled again because
// `createFileRoute()` takes a literal the generator reads without executing the file;
// the mailer in `composition` builds the link from that same entry.
export const Route = createFileRoute("/(shell)/invitation/$token")({
  staticData: { messages: MESSAGES },
  loader: async ({ context, params }) => {
    const [, preview] = await Promise.all([
      context.messages.ensure(MESSAGES),
      fetchInvitation({ data: { token: params.token } }),
    ]);
    return { preview };
  },
  component: InvitationPage,
});

function InvitationPage() {
  const { t } = useMessages("organization");
  const { preview } = Route.useLoaderData();
  const { token } = Route.useParams();
  const { session, queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();

  const auth = useMemo(() => new AuthClient({ baseUrl: Endpoint.auth }), []);
  const organization = useMemo(() => new OrganizationClient(auth), [auth]);

  // The same three steps sign-out and a switch take, for the same reason: the session
  // now points at a tenant this tab has never loaded, so nothing cached is trustworthy.
  const accepted = () => {
    queryClient.clear();
    session.invalidate();
    void router.invalidate().then(() => navigate({ to: "/" }));
  };

  return (
    <main>
      <h1>{t("organization.invitation.title")}</h1>
      <InvitationAccept
        preview={preview}
        token={token}
        organization={organization}
        onAccepted={accepted}
        // Back here once signed in, so the accept button is one click away rather
        // than a link to dig out of the inbox again.
        onSignIn={() =>
          void navigate({ to: "/sign-in", search: { redirect: `/invitation/${token}` } })
        }
        // A brand-new account needs no redirect: its first sign-in claims the
        // invitation by verified address and lands in the inviting organization.
        onSignUp={() => void navigate({ to: "/sign-up" })}
      />
    </main>
  );
}

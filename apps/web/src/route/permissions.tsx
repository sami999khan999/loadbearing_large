import type { ClientNamespace } from "@loadbearing/content";
import { EffectivePermissionsInspector, RoleMatrix, useMessages } from "@loadbearing/feature";
import { createFileRoute } from "@tanstack/react-router";
import { RouteGuard } from "./-guard.js";

// One local const referenced twice, as in `/sign-in`: `staticData` is what a prefetcher
// or a coverage test can read without executing anything, and the loader resolves it.
const MESSAGES = ["role"] as const satisfies readonly ClientNamespace[];

// The first route in the kit behind a real gate, and the reason the two guards in
// `-guard.ts` are no longer dead code. Both run, in order: an anonymous visitor is sent
// to `/sign-in` rather than to `/forbidden`, because "you are not signed in" and "you
// are signed in and may not do this" are different answers and only one of them is
// worth a login form.
//
// `rbac.role.read` is held by `owner` and `admin` in `SystemRoleSeed` and by neither
// `member` nor `guest` — and it is the same key `role.list` is gated on in
// `PROCEDURE_PERMISSIONS` and the same key `ListRolesUseCase` asserts. One decision,
// three of its four surfaces visible on this page.
export const Route = createFileRoute("/permissions")({
  beforeLoad: (context) => {
    RouteGuard.requireSession()(context);
    RouteGuard.requirePermission("rbac.role.read")(context);
  },
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Permissions,
});

function Permissions() {
  const { t } = useMessages("role");

  return (
    <main>
      <h1>{t("role.title")}</h1>
      {/* Server state: every role in the tenant and what it grants, read through
          `RoleQueries.list`. This is the half a guard cannot fake — the API answers
          FORBIDDEN to the same key the guard checked. */}
      <RoleMatrix />
      {/* Client state: what *this* principal can do, answered from the catalog in the
          bundle and the session's own `CapabilitySet`. No query, no round trip. */}
      <EffectivePermissionsInspector />
    </main>
  );
}

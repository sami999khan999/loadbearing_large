import { createFileRoute } from "@tanstack/react-router";
import {
  type ClientNamespace,
  EffectivePermissionsInspector,
  RoleMatrix,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

// One local const referenced twice, as in `/sign-in`: `staticData` is what a prefetcher
// or a coverage test can read without executing anything, and the loader resolves it.
const MESSAGES = ["role"] as const satisfies readonly ClientNamespace[];

// The first route in the kit behind a real gate, and the reason the two guards in
// `-guard.ts` are no longer dead code. Both still run, in order, but they no longer run
// here: `(app)/_authenticated.tsx` owns `requireSession()` for everything beneath it, so
// an anonymous visitor is sent to `/sign-in` before this file's `beforeLoad` is reached.
// "You are not signed in" and "you are signed in and may not do this" are different
// answers and only one of them is worth a login form.
//
// `rbac.role.read` is held by `owner` and `admin` in `SystemRoleSeed` and by neither
// `member` nor `guest` — and it is the same key `role.list` is gated on in
// `PROCEDURE_PERMISSIONS` and the same key `ListRolesUseCase` asserts. One decision,
// three of its four surfaces visible on this page.
//
// The path is `ROUTES.rbac.roles`, spelled again because `createFileRoute()` takes a
// literal the generator reads without executing the file. `rbac.gate.ts` points the nav
// at that same entry, so the two agree by construction rather than by memory.
export const Route = createFileRoute("/(app)/_authenticated/settings/roles")({
  beforeLoad: RouteGuard.requirePermission("rbac.role.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Roles,
});

function Roles() {
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

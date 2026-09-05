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

// Behind `rbac.role.read` — the same key the procedure is gated on and the use-case
// asserts. See docs/reference/enforcement-surfaces.md.
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
      {
        // Server state: the half a guard cannot fake, because the API answers FORBIDDEN
        // to the same key the guard checked.
      }
      <RoleMatrix />
      {
        // Client state: answered from the bundled catalog and the session's own
        // `CapabilitySet`. No query, no round trip.
      }
      <EffectivePermissionsInspector />
    </main>
  );
}

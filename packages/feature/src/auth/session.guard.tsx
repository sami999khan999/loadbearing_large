import type { PermissionKey, ReactNode } from "../import.js";
import { useSession } from "./session.context.js";

export interface SessionGuardProps {
  readonly permission?: PermissionKey;
  readonly goalId?: string;
  readonly children: ReactNode;
  // Callbacks, never a `<Navigate>`. That is the router ban in practice: `apps/web`
  // passes `() => navigate({ to: "/sign-in" })` and the desktop shell passes its own.
  // The component knows *that* it should redirect, never *how*.
  readonly onUnauthenticated: () => void;
  readonly onForbidden: () => void;
}

// The weakest of four enforcement surfaces, and the only one a user can see. The order
// of authority is `Authorizer.assert()` in the use-case, then `principalMiddleware`,
// then the route guard, then this. Removing a permission from a role must hide the
// affordance **and** return FORBIDDEN — one without the other is either security
// theatre or a UI full of buttons that error.
export function SessionGuard({
  permission,
  goalId,
  children,
  onUnauthenticated,
  onForbidden,
}: SessionGuardProps): ReactNode {
  const { user, capabilities } = useSession();

  if (!user) {
    onUnauthenticated();
    return null;
  }

  if (permission && !capabilities.can(permission, goalId)) {
    onForbidden();
    return null;
  }

  return children;
}

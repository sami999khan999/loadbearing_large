import type { PermissionKey, ReactNode } from "../import.js";
import { useSession } from "./session.context.js";

export interface SessionGuardProps {
  readonly permission?: PermissionKey;
  readonly goalId?: string;
  readonly children: ReactNode;
  // Callbacks, never a `<Navigate>` — the router ban in practice. The component knows
  // *that* it should redirect, never *how*.
  readonly onUnauthenticated: () => void;
  readonly onForbidden: () => void;
}

// The weakest of four enforcement surfaces and the only one a user can see: the gate is
// `Authorizer.assert()` in the use-case, which runs whether or not this rendered.
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

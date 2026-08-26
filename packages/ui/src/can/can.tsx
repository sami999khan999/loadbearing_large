import type { CapabilitySet, PermissionKey, ReactNode } from "../import.js";

export interface CanProps {
  readonly permission: PermissionKey;
  readonly capabilities: CapabilitySet;
  // The permission *scope* id, spelled exactly as the kernel spells it. It reads like a
  // domain noun and is not one — it names a tier in the authorization model — so this is
  // the one file the domain-noun gate in 22 has to skip. Renaming it here would hide the
  // pass-through behind a word nobody can grep for.
  readonly goalId?: string;
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

// A pure conditional with no domain knowledge, which is why it is in `ui` rather than
// `feature`. It calls the same `CapabilitySet.can()` the server calls — one
// implementation used by both, not two that agree today.
//
// It is a convenience, never the gate. Hiding a button is a UX affordance; the real
// check is `Authorizer.assert()` in the use-case, and that runs whether or not the
// button was ever rendered.
export function Can({
  permission,
  capabilities,
  goalId,
  children,
  fallback = null,
}: CanProps): ReactNode {
  // Returned bare rather than wrapped in a fragment: both branches are already
  // `ReactNode`, and the wrapper is what `noUselessFragments` objects to.
  return capabilities.can(permission, goalId) ? children : fallback;
}

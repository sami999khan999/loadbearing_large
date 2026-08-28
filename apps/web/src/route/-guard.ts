import type { SessionUser } from "@loadbearing/feature";
import { CapabilitySet, type CapabilitySetDto, type PermissionKey } from "@loadbearing/permissions";
import { redirect } from "@tanstack/react-router";

// The third of four enforcement surfaces (23). It stops the page rendering at all,
// which the component-level `<Can>` cannot — but it is still not the real gate.
//
// The leading hyphen keeps this file out of the route tree: framework naming wins
// inside `src/route/`.
export class RouteGuard {
  private constructor() {}

  public static requirePermission(permission: PermissionKey, goalId?: string) {
    return ({ context }: { context: { capabilities: CapabilitySetDto } }): void => {
      // Same `CapabilitySet.can()` the server calls. That identity is the entire point,
      // and it is why the DTO is rebuilt here rather than a shape-check being written
      // against the JSON — a second implementation of `can()` is a second answer.
      if (!CapabilitySet.from(context.capabilities).can(permission, goalId)) {
        throw redirect({ to: "/forbidden" });
      }
    };
  }

  public static requireSession() {
    return ({ context }: { context: { user: SessionUser | null } }): void => {
      if (!context.user) throw redirect({ to: "/sign-in" });
    };
  }
}

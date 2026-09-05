import { redirect } from "@tanstack/react-router";
import {
  CapabilitySet,
  type CapabilitySetDto,
  type PermissionKey,
  type SessionUser,
} from "~/import.js";

// The third of four enforcement surfaces, and still not the real gate. The leading
// hyphen keeps it out of the route tree. See docs/reference/enforcement-surfaces.md.
export class RouteGuard {
  private constructor() {}

  public static requirePermission(permission: PermissionKey, goalId?: string) {
    return ({ context }: { context: { capabilities: CapabilitySetDto } }): void => {
      // The same `CapabilitySet.can()` the server calls, which is why the DTO is rebuilt
      // rather than shape-checked: a second implementation is a second answer.
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

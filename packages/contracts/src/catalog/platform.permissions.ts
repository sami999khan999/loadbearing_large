import type { PermissionKey } from "../import.js";

// One entry per path in `PlatformProcedures`. The rest of the platform scope is
// registered ahead of the screens that assert it — see `AWAITING_A_PROCEDURE`.
export const platformProcedurePermissions = {
  "platform.status": "platform.status.read",
} as const satisfies Record<string, PermissionKey>;

import type { PermissionKey } from "../import.js";

// One entry per path in `PlatformProcedures`. The rest of the platform scope is
// registered ahead of the screens that assert it — see `AWAITING_A_PROCEDURE`.
export const platformProcedurePermissions = {
  "platform.status": "platform.status.read",
  // Read and manage split, because they are not the same risk: seeing how long data is
  // kept is an operational question, and shortening it destroys rows on the next run.
  "platform.listRetention": "platform.retention.read",
  // Read, not manage: seeing what a change would destroy must not require the right
  // to cause it, or nobody reviews the number before somebody with the right types it.
  "platform.previewRetention": "platform.retention.read",
  "platform.updateRetention": "platform.retention.manage",
} as const satisfies Record<string, PermissionKey>;

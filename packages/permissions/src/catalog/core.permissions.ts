import type { PermissionMeta } from "../registry/index.js";

// Held by every resolved principal, in `CapabilitySet.can()` rather than through a role —
// a role that granted it could be missing it. See docs/reference/capability-set.md.
export const corePermissions = {
  "core.activity.write": {
    scope: "org",
    module: "core",
    label: "Write audit entries",
  },
} as const satisfies Record<string, PermissionMeta>;

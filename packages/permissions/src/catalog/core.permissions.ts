import type { PermissionMeta } from "../registry/index.js";

// Platform-level, held by every principal that writes an audit row — including the
// worker's. Deliberately not granted through a role: it is a property of acting at all.
export const corePermissions = {
  "core.activity.write": {
    scope: "org",
    module: "core",
    label: "Write audit entries",
  },
} as const satisfies Record<string, PermissionMeta>;

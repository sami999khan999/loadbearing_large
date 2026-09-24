import type { PermissionMeta } from "../registry/index.js";

// Above the tenant. Every key here is `scope: "platform"`, which is what keeps it out of
// a tenant owner's `all` and out of the role editor — see docs/reference/platform-scope.md.
export const platformPermissions = {
  "platform.status.read": {
    scope: "platform",
    module: "platform",
    label: "View platform status",
  },
  "platform.retention.read": {
    scope: "platform",
    module: "platform",
    label: "View retention policy",
  },
  "platform.retention.manage": {
    scope: "platform",
    module: "platform",
    label: "Change retention policy",
  },
  "platform.analytics.read": {
    scope: "platform",
    module: "platform",
    label: "View analytics policy",
  },
  "platform.analytics.manage": {
    scope: "platform",
    module: "platform",
    label: "Change analytics policy",
  },
  "platform.storage.read": {
    scope: "platform",
    module: "platform",
    label: "View tenant storage",
  },
  "platform.shards.read": {
    scope: "platform",
    module: "platform",
    label: "View the shard map",
  },
  "platform.shards.manage": {
    scope: "platform",
    module: "platform",
    label: "Move a tenant between nodes",
  },
  "platform.tenant.manage": {
    scope: "platform",
    module: "platform",
    label: "Delete and export a tenant",
  },
} as const satisfies Record<string, PermissionMeta>;

import type { PermissionMeta } from "../registry/index.js";

export const rbacPermissions = {
  "rbac.role.read": { scope: "org", module: "rbac", label: "View roles" },
  "rbac.role.manage": {
    scope: "org",
    module: "rbac",
    label: "Create and edit roles",
  },
  "rbac.permission.grant": {
    scope: "org",
    module: "rbac",
    label: "Grant permissions",
  },
  "rbac.permission.revoke": {
    scope: "org",
    module: "rbac",
    label: "Revoke permissions",
  },
  "rbac.effective.inspect": {
    scope: "org",
    module: "rbac",
    label: "Inspect effective permissions",
  },
  "member.read": { scope: "org", module: "rbac", label: "View members" },
  "member.invite": { scope: "org", module: "rbac", label: "Invite members" },
  "member.deactivate": {
    scope: "org",
    module: "rbac",
    label: "Deactivate members",
  },
  "apikey.read": { scope: "org", module: "rbac", label: "View API keys" },
  "apikey.manage": {
    scope: "org",
    module: "rbac",
    label: "Create and revoke API keys",
  },
} as const satisfies Record<string, PermissionMeta>;

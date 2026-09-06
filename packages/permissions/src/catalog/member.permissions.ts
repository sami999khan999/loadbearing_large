import type { PermissionMeta } from "../registry/index.js";

// Its own fragment and its own module, because the key says so: the grammar is
// `<module>.<subject>.<action>` and these opened `member.` while declaring `rbac`.
export const memberPermissions = {
  "member.read": { scope: "org", module: "member", label: "View members" },
  "member.invite": { scope: "org", module: "member", label: "Invite members" },
  "member.deactivate": {
    scope: "org",
    module: "member",
    label: "Deactivate members",
  },
} as const satisfies Record<string, PermissionMeta>;

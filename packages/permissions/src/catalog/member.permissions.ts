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
  // Separate from `deactivate`: removing someone's access and changing what they may do
  // are different powers, and a role that can do one need not do the other.
  "member.role.change": {
    scope: "org",
    module: "member",
    label: "Change a member's role",
  },
} as const satisfies Record<string, PermissionMeta>;

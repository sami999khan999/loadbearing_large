import type { ModuleGate } from "../module-registry.js";

export const rbacGates = {
  rbac: { permission: "rbac.role.read", route: "/settings/roles" },
  member: { permission: "member.read", route: "/settings/members" },
} as const satisfies Record<string, ModuleGate>;

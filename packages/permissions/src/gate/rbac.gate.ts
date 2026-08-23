import type { ModuleGate } from "../registry/index.js";
import { ROUTES } from "../route/index.js";

export const rbacGates = {
  rbac: { permission: "rbac.role.read", route: ROUTES.rbac.roles },
  member: { permission: "member.read", route: ROUTES.rbac.members },
} as const satisfies Record<string, ModuleGate>;

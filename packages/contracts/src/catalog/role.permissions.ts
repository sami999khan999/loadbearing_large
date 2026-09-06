import type { PermissionKey } from "../import.js";

// One entry per path in `RoleProcedures`. A procedure with no entry is denied rather
// than allowed, and the coverage test fails before it can ship.
export const roleProcedurePermissions = {
  "role.list": "rbac.role.read",
  "role.effective": "rbac.effective.inspect",
} as const satisfies Record<string, PermissionKey>;

import type { PermissionKey } from "../import.js";

// One entry per procedure path in `RoleProcedures`. A procedure with no entry here is
// denied by `principalMiddleware` rather than allowed, and the coverage test in
// `tests/registry/` fails before it can ship — so this file is the only place the gate
// for a role procedure is decided.
export const roleProcedurePermissions = {
  "role.list": "rbac.role.read",
} as const satisfies Record<string, PermissionKey>;

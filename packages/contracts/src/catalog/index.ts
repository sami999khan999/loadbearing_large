import type { PermissionKey } from "../import.js";
import { memberProcedurePermissions } from "./member.permissions.js";
import { roleProcedurePermissions } from "./role.permissions.js";

// Merged from team-owned fragments, one `<subject>.permissions.ts` per slice. Add
// them here — `...taskProcedurePermissions`. Fragmented for the same reason the
// permission catalog is: one team, one file, no merge conflicts in a shared list.
//
// Not re-exported from the package barrel. It is an input to `ProcedurePermissions`
// and to the coverage test, and nothing outside this package may read it.
export const PROCEDURE_PERMISSIONS: Readonly<Record<string, PermissionKey>> = {
  ...roleProcedurePermissions,
  ...memberProcedurePermissions,
};

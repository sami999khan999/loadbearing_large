import type { PermissionKey } from "../import.js";
import { apiKeyProcedurePermissions } from "./apikey.permissions.js";
import { documentProcedurePermissions } from "./document.permissions.js";
import { memberProcedurePermissions } from "./member.permissions.js";
import { notificationProcedurePermissions } from "./notification.permissions.js";
import { roleProcedurePermissions } from "./role.permissions.js";

// Merged from team-owned fragments, one per slice — add them here. Not re-exported:
// nothing outside this package may read it.
export const PROCEDURE_PERMISSIONS: Readonly<Record<string, PermissionKey>> = {
  ...roleProcedurePermissions,
  ...memberProcedurePermissions,
  ...notificationProcedurePermissions,
  ...apiKeyProcedurePermissions,
  ...documentProcedurePermissions,
};

export { DOMAIN_EVENTS } from "./domain-events.js";

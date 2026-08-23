import { rbacPermissions } from "./rbac.permissions.js";

// Merged from team-owned fragments. Add them here — `...taskPermissions`.
export const CATALOG = {
  ...rbacPermissions,
} as const;

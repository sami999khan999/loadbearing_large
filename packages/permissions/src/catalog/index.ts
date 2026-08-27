import { aiPermissions } from "./ai.permissions.js";
import { corePermissions } from "./core.permissions.js";
import { rbacPermissions } from "./rbac.permissions.js";

// Merged from team-owned fragments. Add them here — `...taskPermissions`.
export const CATALOG = {
  ...corePermissions,
  ...rbacPermissions,
  ...aiPermissions,
} as const;

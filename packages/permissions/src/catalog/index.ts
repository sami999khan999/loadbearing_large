import { aiPermissions } from "./ai.permissions.js";
import { apiKeyPermissions } from "./apikey.permissions.js";
import { corePermissions } from "./core.permissions.js";
import { memberPermissions } from "./member.permissions.js";
import { rbacPermissions } from "./rbac.permissions.js";

// Merged from team-owned fragments. Add them here — `...taskPermissions`.
export const CATALOG = {
  ...corePermissions,
  ...rbacPermissions,
  ...memberPermissions,
  ...apiKeyPermissions,
  ...aiPermissions,
} as const;

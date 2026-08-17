import { rbacPermissions } from "./rbac.permissions.js";

export const CATALOG = {
  ...rbacPermissions,
  // ...taskPermissions,
  // ...financePermissions,
} as const;

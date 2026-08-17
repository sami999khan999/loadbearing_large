import { rbacGates } from "./rbac.gate.js";

export const GATES = {
  ...rbacGates,
  // ...taskGates,
  // ...financeGates,
} as const;

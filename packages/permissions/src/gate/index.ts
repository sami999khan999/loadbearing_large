import { rbacGates } from "./rbac.gate.js";

// Merged from team-owned fragments. Add them here — `...taskGates`.
export const GATES = {
  ...rbacGates,
} as const;

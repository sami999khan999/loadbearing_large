import type { AnyContractRouter } from "../import.js";
import { RoleProcedures } from "../role/index.js";

// The merge point for every slice's `<subject>.procedures.ts`. Add each slice here —
// `task: TaskProcedures.all`. `satisfies` is what makes a fragment that is not an
// oRPC contract fail on this line rather than downstream in `apps/web`.
export const contract = { role: RoleProcedures.all } as const satisfies AnyContractRouter;

export type AppContract = typeof contract;

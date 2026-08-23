import type { AnyContractRouter } from "../import.js";

// The merge point for every slice's `<subject>.procedures.ts`. Add each slice here —
// `task: TaskProcedures.all`. `satisfies` is what makes a fragment that is not an
// oRPC contract fail on this line rather than downstream in `apps/web`.
export const contract = {} as const satisfies AnyContractRouter;

export type AppContract = typeof contract;

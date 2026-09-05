import type { AnyContractRouter } from "../import.js";
import { MemberProcedures } from "../member/index.js";
import { RoleProcedures } from "../role/index.js";

// The merge point for every slice's procedures. `satisfies` is what makes a fragment
// that is not an oRPC contract fail here rather than downstream in `apps/web`.
export const contract = {
  role: RoleProcedures.all,
  member: MemberProcedures.all,
} as const satisfies AnyContractRouter;

export type AppContract = typeof contract;

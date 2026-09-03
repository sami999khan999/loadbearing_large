import { MemberRouter } from "./member.router.js";
import { RoleRouter } from "./role.router.js";

// The merge point, mirroring `contract` from `@loadbearing/contracts` exactly — a
// mismatch is a type error. One line per slice: `task: TaskRouter.all`.
export const appRouter = { role: RoleRouter.all, member: MemberRouter.all };

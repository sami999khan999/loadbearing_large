import { authed } from "./base.js";

// Three lines per procedure: pull the use-case off the container, call `execute` with
// the principal and the validated input, return the result. No business logic, no
// authorization decision, no error mapping — all three live one layer down, which is
// what makes swapping to NestJS a rewrite of *this file* and nothing else.
export class RoleRouter {
  private constructor() {}

  public static readonly list = authed.role.list.handler(({ input, context }) =>
    context.container.rbac.listRoles.execute(context.principal, input),
  );

  // The object the merge point in `app.router.ts` mounts, mirroring `RoleProcedures.all`.
  public static readonly all = { list: RoleRouter.list } as const;
}

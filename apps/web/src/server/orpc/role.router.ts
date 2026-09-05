import { authed } from "./base.js";

// Three lines per procedure and nothing else: no business logic, no authorization, no
// error mapping — which is what makes a framework swap a rewrite of this file alone.
export class RoleRouter {
  private constructor() {}

  public static readonly list = authed.role.list.handler(({ input, context }) =>
    context.container.rbac.listRoles.execute(context.principal, input),
  );

  // The object the merge point in `app.router.ts` mounts, mirroring `RoleProcedures.all`.
  public static readonly all = { list: RoleRouter.list } as const;
}

import { authed } from "./base.js";

// Three lines per procedure and nothing else: no business logic, no authorization, no
// error mapping — which is what makes a framework swap a rewrite of this file alone.
export class RoleRouter {
  private constructor() {}

  public static readonly list = authed.role.list.handler(({ input, context }) =>
    context.container.rbac.listRoles.execute(context.principal, input),
  );

  // `toJSON()` is the four lines: the use-case answers a `CapabilitySet` because that
  // is the domain's type, and the contract declares its wire shape.
  public static readonly effective = authed.role.effective.handler(async ({ input, context }) => {
    const capabilities = await context.container.rbac.inspectEffective.execute(
      context.principal,
      input,
    );

    return capabilities.toJSON();
  });

  // The object the merge point in `app.router.ts` mounts, mirroring `RoleProcedures.all`.
  public static readonly all = {
    list: RoleRouter.list,
    effective: RoleRouter.effective,
  } as const;
}

import { authed } from "./base.js";

// The proof page's one handler. `ProcedurePermissions` gates the path before this runs
// and the use-case asserts again — the two are deliberate, not redundant.
export class PlatformRouter {
  private constructor() {}

  public static readonly status = authed.platform.status.handler(({ context }) =>
    context.container.platformAdmin.inspectStatus.execute(context.principal),
  );

  public static readonly listRetention = authed.platform.listRetention.handler(({ context }) =>
    context.container.platformAdmin.listRetention.execute(context.principal),
  );

  // `acknowledged` rather than the row: the screen refetches the list, which also
  // carries what the bucket and ClickHouse now hold, and one of those may have drifted.
  public static readonly updateRetention = authed.platform.updateRetention.handler(
    async ({ input, context }) => {
      await context.container.platformAdmin.updateRetention.execute(context.principal, input);
      return { ok: true } as const;
    },
  );

  // The object the merge point in `app.router.ts` mounts, mirroring
  // `PlatformProcedures.all`.
  public static readonly all = {
    status: PlatformRouter.status,
    listRetention: PlatformRouter.listRetention,
    updateRetention: PlatformRouter.updateRetention,
  } as const;
}

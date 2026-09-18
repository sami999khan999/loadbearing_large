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

  public static readonly previewRetention = authed.platform.previewRetention.handler(
    ({ input, context }) =>
      context.container.platformAdmin.previewRetention.execute(context.principal, input),
  );

  public static readonly restorePartition = authed.platform.restorePartition.handler(
    ({ input, context }) =>
      context.container.platformAdmin.restorePartition.execute(context.principal, input),
  );

  public static readonly updateTenantRetention = authed.platform.updateTenantRetention.handler(
    async ({ input, context }) => {
      await context.container.platformAdmin.updateTenantRetention.execute(context.principal, input);
      return { ok: true } as const;
    },
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
    previewRetention: PlatformRouter.previewRetention,
    restorePartition: PlatformRouter.restorePartition,
    updateTenantRetention: PlatformRouter.updateTenantRetention,
    updateRetention: PlatformRouter.updateRetention,
  } as const;
}

import { authed } from "../import.js";

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

  public static readonly deleteTenant = authed.platform.deleteTenant.handler(({ input, context }) =>
    context.container.platformAdmin.deleteOrganization.execute(context.principal, input),
  );

  public static readonly exportTenant = authed.platform.exportTenant.handler(({ input, context }) =>
    context.container.platformAdmin.exportOrganization.execute(context.principal, input),
  );

  public static readonly listExports = authed.platform.listExports.handler(({ input, context }) =>
    context.container.platformAdmin.listExports.execute(context.principal, input),
  );

  public static readonly listGaps = authed.platform.listGaps.handler(({ context }) =>
    context.container.platformAdmin.listGaps.execute(context.principal),
  );

  public static readonly reprojectPartition = authed.platform.reprojectPartition.handler(
    ({ input, context }) =>
      context.container.platformAdmin.reprojectPartition.execute(context.principal, input),
  );

  public static readonly getPolicy = authed.platform.getPolicy.handler(async ({ context }) => {
    const policy = await context.container.platformAdmin.getPolicy.execute(context.principal);
    return policy;
  });

  public static readonly updateProjectionSwitch = authed.platform.updateProjectionSwitch.handler(
    async ({ input, context }) => {
      await context.container.platformAdmin.toggleProjection.execute(context.principal, input);
      return { ok: true } as const;
    },
  );

  public static readonly updateReplicaSwitch = authed.platform.updateReplicaSwitch.handler(
    async ({ input, context }) => {
      await context.container.platformAdmin.toggleReplicaReads.execute(context.principal, input);
      return { ok: true } as const;
    },
  );

  public static readonly listProjection = authed.platform.listProjection.handler(({ context }) =>
    context.container.platformAdmin.listProjection.execute(context.principal),
  );

  public static readonly updateProjection = authed.platform.updateProjection.handler(
    async ({ input, context }) => {
      await context.container.platformAdmin.updateProjection.execute(context.principal, input);
      return { ok: true } as const;
    },
  );

  public static readonly listStorage = authed.platform.listStorage.handler(({ input, context }) =>
    context.container.platformAdmin.listStorage.execute(context.principal, input),
  );

  // `acknowledged` rather than the row: the screen refetches the list, which also
  // carries what the bucket and ClickHouse now hold, and one of those may have drifted.
  public static readonly updateRetention = authed.platform.updateRetention.handler(
    async ({ input, context }) => {
      await context.container.platformAdmin.updateRetention.execute(context.principal, input);
      return { ok: true } as const;
    },
  );

  public static readonly shardMap = authed.platform.shardMap.handler(({ input, context }) =>
    context.container.platformAdmin.inspectShardMap.execute(context.principal, input),
  );

  public static readonly locateTenant = authed.platform.locateTenant.handler(({ input, context }) =>
    context.container.platformAdmin.locateTenant.execute(context.principal, input),
  );

  // Queues, never runs: the move is placed on nothing and names both nodes itself, and
  // the request is placed on the admin's tenant, which is neither of them.
  public static readonly moveTenant = authed.platform.moveTenant.handler(({ input, context }) =>
    context.container.platformAdmin.moveTenant.execute(context.principal, input),
  );

  // The object the merge point in `app.router.ts` mounts, mirroring
  // `PlatformProcedures.all`.
  public static readonly all = {
    status: PlatformRouter.status,
    listRetention: PlatformRouter.listRetention,
    previewRetention: PlatformRouter.previewRetention,
    restorePartition: PlatformRouter.restorePartition,
    updateTenantRetention: PlatformRouter.updateTenantRetention,
    listStorage: PlatformRouter.listStorage,
    getPolicy: PlatformRouter.getPolicy,
    listGaps: PlatformRouter.listGaps,
    reprojectPartition: PlatformRouter.reprojectPartition,
    updateProjectionSwitch: PlatformRouter.updateProjectionSwitch,
    updateReplicaSwitch: PlatformRouter.updateReplicaSwitch,
    listProjection: PlatformRouter.listProjection,
    updateProjection: PlatformRouter.updateProjection,
    deleteTenant: PlatformRouter.deleteTenant,
    exportTenant: PlatformRouter.exportTenant,
    listExports: PlatformRouter.listExports,
    updateRetention: PlatformRouter.updateRetention,
    shardMap: PlatformRouter.shardMap,
    locateTenant: PlatformRouter.locateTenant,
    moveTenant: PlatformRouter.moveTenant,
  } as const;
}

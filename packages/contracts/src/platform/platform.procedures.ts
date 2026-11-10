import { oc, z } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { PlatformContract } from "./platform.contract.js";

export class PlatformProcedures {
  private constructor() {}

  // No input: the tier is one organization and the report is the whole deployment's.
  // The permission is what makes this a platform read rather than a public probe.
  public static readonly status = oc
    .route({ method: "GET", path: "/platform/status" })
    .output(PlatformContract.status);

  public static readonly listRetention = oc
    .route({ method: "GET", path: "/platform/retention" })
    .output(PlatformContract.retention);

  // `GET` with the value being *typed* in the query string, not the value saved: a
  // preview of what is already stored tells an operator nothing they did not have.
  public static readonly previewRetention = oc
    .route({ method: "GET", path: "/platform/retention/preview" })
    .input(PlatformContract.previewQuery)
    .output(PlatformContract.retentionPreview);

  // `PUT` on a sub-resource of the tenant, because that is what the row is: one
  // tenant's override of one table, replaced whole.
  public static readonly updateTenantRetention = oc
    .route({ method: "PUT", path: "/platform/retention/tenant" })
    .input(PlatformContract.tenantRetentionUpdate)
    .output(Envelope.acknowledged);

  // `POST` and a job id back: the work is a stream out of S3 and an insert per batch,
  // and a request that waited for it would hold a connection open for minutes.
  public static readonly restorePartition = oc
    .route({ method: "POST", path: "/platform/retention/restore" })
    .input(PlatformContract.restore)
    .output(PlatformContract.restoreRequested);

  // `DELETE` on the tenant, and the body carries the slug: the id is what is being
  // removed and the slug is the operator saying they know which one.
  public static readonly deleteTenant = oc
    .route({ method: "DELETE", path: "/platform/tenants" })
    .input(PlatformContract.tenantDelete)
    .output(PlatformContract.deleteRequested);

  // `POST` and a job id back: an export is a full read of seven tables streamed to
  // S3, and a request that waited for it would hold a connection open for minutes.
  public static readonly exportTenant = oc
    .route({ method: "POST", path: "/platform/tenants/export" })
    .input(PlatformContract.tenantExport)
    .output(PlatformContract.exportRequested);

  public static readonly listExports = oc
    .route({ method: "GET", path: "/platform/tenants/export" })
    .input(PlatformContract.tenantExport)
    .output(z.array(PlatformContract.tenantExportObject).readonly());

  // Its own read, because the list leaves the images out: a tenant's thousands of them
  // would bury the files an operator came for.
  public static readonly listExportImages = oc
    .route({ method: "GET", path: "/platform/tenants/export/images" })
    .input(PlatformContract.tenantExportDay)
    .output(z.array(PlatformContract.tenantExportImage).readonly());

  public static readonly listGaps = oc
    .route({ method: "GET", path: "/platform/projection/gaps" })
    .output(z.array(PlatformContract.projectionGap).readonly());

  // `POST` and a job id back: a month is a read out of S3 and an insert per batch.
  public static readonly reprojectPartition = oc
    .route({ method: "POST", path: "/platform/projection/reproject" })
    .input(PlatformContract.reproject)
    .output(PlatformContract.reprojectRequested);

  public static readonly getPolicy = oc
    .route({ method: "GET", path: "/platform/policy" })
    .output(PlatformContract.policy);

  public static readonly updateProjectionSwitch = oc
    .route({ method: "PUT", path: "/platform/policy/projection" })
    .input(PlatformContract.projectionToggle)
    .output(Envelope.acknowledged);

  public static readonly updateReplicaSwitch = oc
    .route({ method: "PUT", path: "/platform/policy/replica" })
    .input(PlatformContract.replicaToggle)
    .output(Envelope.acknowledged);

  // Every flag, server-only ones included. The one place those names leave the server,
  // and only to a platform admin.
  public static readonly listFlags = oc
    .route({ method: "GET", path: "/platform/flags" })
    .output(PlatformContract.flagList);

  public static readonly updateFlag = oc
    .route({ method: "PUT", path: "/platform/flags" })
    .input(PlatformContract.flagToggle)
    .output(Envelope.acknowledged);

  public static readonly updateFlagTarget = oc
    .route({ method: "PUT", path: "/platform/flags/organization" })
    .input(PlatformContract.flagTargetToggle)
    .output(Envelope.acknowledged);

  public static readonly listPlans = oc
    .route({ method: "GET", path: "/platform/plans" })
    .output(PlatformContract.planList);

  public static readonly savePlan = oc
    .route({ method: "PUT", path: "/platform/plans" })
    .input(PlatformContract.planSave)
    .output(Envelope.acknowledged);

  public static readonly deletePlan = oc
    .route({ method: "DELETE", path: "/platform/plans" })
    .input(PlatformContract.planRef)
    .output(Envelope.acknowledged);

  // What the next signup lands on (`RV.14`). Not on the plan's own row: one default, many plans.
  public static readonly updateDefaultPlan = oc
    .route({ method: "PUT", path: "/platform/plans/default" })
    .input(PlatformContract.planRef)
    .output(Envelope.acknowledged);

  public static readonly organizationEntitlement = oc
    .route({ method: "GET", path: "/platform/entitlements" })
    .input(PlatformContract.organizationRef)
    .output(PlatformContract.organizationEntitlement);

  public static readonly assignPlan = oc
    .route({ method: "PUT", path: "/platform/entitlements/plan" })
    .input(PlatformContract.planAssign)
    .output(Envelope.acknowledged);

  public static readonly adjustEntitlement = oc
    .route({ method: "PUT", path: "/platform/entitlements/adjustments" })
    .input(PlatformContract.adjustmentSave)
    .output(PlatformContract.adjusted);

  public static readonly clearAdjustment = oc
    .route({ method: "DELETE", path: "/platform/entitlements/adjustments" })
    .input(PlatformContract.adjustmentClear)
    .output(Envelope.acknowledged);

  // By address in the query string, because that is what a support ticket carries.
  public static readonly findAccount = oc
    .route({ method: "GET", path: "/platform/accounts" })
    .input(PlatformContract.accountQuery)
    .output(PlatformContract.account);

  public static readonly suspendAccount = oc
    .route({ method: "POST", path: "/platform/accounts/suspend" })
    .input(PlatformContract.accountSuspension)
    .output(Envelope.acknowledged);

  public static readonly reinstateAccount = oc
    .route({ method: "POST", path: "/platform/accounts/reinstate" })
    .input(PlatformContract.accountSuspension)
    .output(Envelope.acknowledged);

  public static readonly denyAccountPermission = oc
    .route({ method: "POST", path: "/platform/accounts/denies" })
    .input(PlatformContract.accountDenySave)
    .output(PlatformContract.adjusted);

  public static readonly clearAccountDeny = oc
    .route({ method: "DELETE", path: "/platform/accounts/denies" })
    .input(PlatformContract.accountDenyClear)
    .output(Envelope.acknowledged);

  public static readonly moduleSwitches = oc
    .route({ method: "GET", path: "/platform/modules" })
    .output(PlatformContract.moduleSwitchList);

  public static readonly updateModuleSwitch = oc
    .route({ method: "PUT", path: "/platform/modules" })
    .input(PlatformContract.moduleSwitchUpdate)
    .output(Envelope.acknowledged);

  public static readonly mailDeliveries = oc
    .route({ method: "GET", path: "/platform/mail/deliveries" })
    .input(PlatformContract.mailDeliveryQuery)
    .output(PlatformContract.mailDeliveryPage);

  // Tokens by tenant, model and UTC day, read from the analytics store.
  public static readonly assistantUsage = oc
    .route({ method: "GET", path: "/platform/assistant-usage" })
    .input(PlatformContract.assistantUsageQuery)
    .output(PlatformContract.assistantUsage);

  public static readonly listProjection = oc
    .route({ method: "GET", path: "/platform/projection" })
    .output(PlatformContract.projection);

  // `PUT` rather than `PATCH`: the body carries every field of one row, and a partial
  // projection change is not a thing an operator means.
  public static readonly updateProjection = oc
    .route({ method: "PUT", path: "/platform/projection" })
    .input(PlatformContract.projectionUpdate)
    .output(Envelope.acknowledged);

  public static readonly listStorage = oc
    .route({ method: "GET", path: "/platform/storage" })
    .input(PlatformContract.tenantStorageQuery)
    .output(PlatformContract.tenantStorage);

  // `PUT` rather than `PATCH`: the body carries every field of one row, and a partial
  // retention change is not a thing an operator means.
  public static readonly updateRetention = oc
    .route({ method: "PUT", path: "/platform/retention" })
    .input(PlatformContract.retentionUpdate)
    .output(Envelope.acknowledged);

  // `GET`, and `node` is a query parameter rather than a path segment: the node list is
  // the resource, and expanding one is a narrowing of it.
  public static readonly shardMap = oc
    .route({ method: "GET", path: "/platform/shards" })
    .input(PlatformContract.shardMapQuery)
    .output(PlatformContract.shardMap);

  // Its own procedure, not a field on the map: an operator typing a slug must not
  // re-read the node list on every keystroke, and a miss is an answer rather than an error.
  public static readonly locateTenant = oc
    .route({ method: "GET", path: "/platform/shards/tenant" })
    .input(PlatformContract.tenantLookup)
    .output(PlatformContract.tenantLocation);

  // `POST` and a job id back: a move freezes the tenant, waits out its writers and
  // copies every row, which is minutes of work no request should hold a connection for.
  public static readonly moveTenant = oc
    .route({ method: "POST", path: "/platform/shards/move" })
    .input(PlatformContract.tenantMove)
    .output(PlatformContract.moveRequested);

  // Polled every few seconds by the Workers page, so it reads Redis and one catalog
  // table and nothing per tenant.
  public static readonly workerFleet = oc
    .route({ method: "GET", path: "/platform/workers" })
    .output(PlatformContract.workerFleet);

  public static readonly pauseQueue = oc
    .route({ method: "PUT", path: "/platform/workers/queue/pause" })
    .input(PlatformContract.queuePause)
    .output(Envelope.acknowledged);

  // `PUT`: the body is the queue's whole autoscale row, replaced.
  public static readonly saveQueueAutoscale = oc
    .route({ method: "PUT", path: "/platform/workers/queue/autoscale" })
    .input(PlatformContract.queueAutoscale)
    .output(Envelope.acknowledged);

  public static readonly pauseWorker = oc
    .route({ method: "PUT", path: "/platform/workers/process/pause" })
    .input(PlatformContract.workerProcessPause)
    .output(Envelope.acknowledged);

  // Returns what the move leaves unserved, so the page can warn before anyone notices.
  public static readonly setWorkerQueues = oc
    .route({ method: "PUT", path: "/platform/workers/process/queues" })
    .input(PlatformContract.workerProcessQueues)
    .output(PlatformContract.workerQueuesChanged);

  public static readonly resetWorker = oc
    .route({ method: "POST", path: "/platform/workers/process/reset" })
    .input(PlatformContract.workerProcessRef)
    .output(Envelope.acknowledged);

  // The object the merge point in `procedure/index.ts` mounts. One place to add a
  // procedure to, rather than two.
  public static readonly all = {
    status: PlatformProcedures.status,
    listRetention: PlatformProcedures.listRetention,
    previewRetention: PlatformProcedures.previewRetention,
    restorePartition: PlatformProcedures.restorePartition,
    updateTenantRetention: PlatformProcedures.updateTenantRetention,
    listStorage: PlatformProcedures.listStorage,
    getPolicy: PlatformProcedures.getPolicy,
    listGaps: PlatformProcedures.listGaps,
    reprojectPartition: PlatformProcedures.reprojectPartition,
    updateProjectionSwitch: PlatformProcedures.updateProjectionSwitch,
    updateReplicaSwitch: PlatformProcedures.updateReplicaSwitch,
    listProjection: PlatformProcedures.listProjection,
    assistantUsage: PlatformProcedures.assistantUsage,
    mailDeliveries: PlatformProcedures.mailDeliveries,
    updateProjection: PlatformProcedures.updateProjection,
    deleteTenant: PlatformProcedures.deleteTenant,
    exportTenant: PlatformProcedures.exportTenant,
    listExports: PlatformProcedures.listExports,
    listExportImages: PlatformProcedures.listExportImages,
    updateRetention: PlatformProcedures.updateRetention,
    shardMap: PlatformProcedures.shardMap,
    locateTenant: PlatformProcedures.locateTenant,
    moveTenant: PlatformProcedures.moveTenant,
    listFlags: PlatformProcedures.listFlags,
    updateFlag: PlatformProcedures.updateFlag,
    updateFlagTarget: PlatformProcedures.updateFlagTarget,
    listPlans: PlatformProcedures.listPlans,
    savePlan: PlatformProcedures.savePlan,
    deletePlan: PlatformProcedures.deletePlan,
    updateDefaultPlan: PlatformProcedures.updateDefaultPlan,
    organizationEntitlement: PlatformProcedures.organizationEntitlement,
    findAccount: PlatformProcedures.findAccount,
    suspendAccount: PlatformProcedures.suspendAccount,
    reinstateAccount: PlatformProcedures.reinstateAccount,
    denyAccountPermission: PlatformProcedures.denyAccountPermission,
    clearAccountDeny: PlatformProcedures.clearAccountDeny,
    assignPlan: PlatformProcedures.assignPlan,
    adjustEntitlement: PlatformProcedures.adjustEntitlement,
    clearAdjustment: PlatformProcedures.clearAdjustment,
    moduleSwitches: PlatformProcedures.moduleSwitches,
    updateModuleSwitch: PlatformProcedures.updateModuleSwitch,
    workerFleet: PlatformProcedures.workerFleet,
    pauseQueue: PlatformProcedures.pauseQueue,
    saveQueueAutoscale: PlatformProcedures.saveQueueAutoscale,
    pauseWorker: PlatformProcedures.pauseWorker,
    setWorkerQueues: PlatformProcedures.setWorkerQueues,
    resetWorker: PlatformProcedures.resetWorker,
  } as const;
}

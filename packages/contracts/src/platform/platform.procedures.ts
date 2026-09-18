import { oc } from "../import.js";
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

  // The object the merge point in `procedure/index.ts` mounts. One place to add a
  // procedure to, rather than two.
  public static readonly all = {
    status: PlatformProcedures.status,
    listRetention: PlatformProcedures.listRetention,
    previewRetention: PlatformProcedures.previewRetention,
    restorePartition: PlatformProcedures.restorePartition,
    updateTenantRetention: PlatformProcedures.updateTenantRetention,
    listStorage: PlatformProcedures.listStorage,
    updateRetention: PlatformProcedures.updateRetention,
  } as const;
}

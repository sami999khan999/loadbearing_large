import type { ApiClient, OrganizationId, TenantStorageQuery } from "../import.js";
import { queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

export class PlatformQueries {
  private constructor() {}

  // Ten seconds, not a minute: this is a health report, and the reason to open the page
  // is that something may be wrong right now.
  public static status(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.platform.status(),
      queryFn: () => client.platform.status(),
      staleTime: 10_000,
    });
  }

  // `staleTime: 0`, and `enabled` is the caller's: this answers "what would this
  // number destroy", and a cached answer is the wrong one.
  public static retentionPreview(client: ApiClient, tableName: string, hotMonths: number) {
    return queryOptions({
      queryKey: QueryKeys.platform.retentionPreview(tableName, hotMonths),
      queryFn: () => client.platform.previewRetention({ tableName, hotMonths }),
      staleTime: 0,
    });
  }

  // A minute: what this shows changes when the nightly run archives a month, so a
  // fresh read on every focus would be a query for a number that moved once.
  public static storage(client: ApiClient, params: TenantStorageQuery) {
    return queryOptions({
      queryKey: QueryKeys.platform.storage(params),
      queryFn: () => client.platform.listStorage(params),
      staleTime: 60_000,
    });
  }

  // `staleTime: 0`: every URL in the answer is presigned and expires, so a cached
  // page is a page of links that have quietly stopped working.
  public static exports(client: ApiClient, organizationId: OrganizationId) {
    return queryOptions({
      queryKey: QueryKeys.platform.exports(organizationId),
      queryFn: () => client.platform.listExports({ organizationId }),
      staleTime: 0,
    });
  }

  // A minute, like the retention read beside it: the rows change when somebody saves,
  // and the mutation invalidates this key. The backstop is for a second tab.
  public static projection(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.platform.projection(),
      queryFn: () => client.platform.listProjection(),
      staleTime: 60_000,
    });
  }

  // A minute, like every other settings read: the rows change when somebody saves, and
  // the mutation invalidates this key. The backstop is for a second tab.
  public static retention(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.platform.retention(),
      queryFn: () => client.platform.listRetention(),
      staleTime: 60_000,
    });
  }
}

import type { ApiClient, PaginationQuery } from "../import.js";
import { queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

// A defined query, never a raw client call from a component. That is the rule the
// ESLint ban on importing `@loadbearing/api-client` outside this package enforces: a
// raw call is an uncached read that no invalidation touches, and the invalidation is
// the whole reason the cache is trustworthy.
export class RoleQueries {
  private constructor() {}

  public static list(client: ApiClient, params: PaginationQuery) {
    return queryOptions({
      // Mirrors the procedure path — `contract.role.list` becomes `["rbac","role","list"]`
      // — so `QueryKeys.rbac.all()` invalidates this by prefix along with everything
      // else the slice caches.
      queryKey: QueryKeys.rbac.roles(),
      queryFn: () => client.role.list(params),
      // Roles change when someone edits them, which is rare and always through a
      // mutation that invalidates this key. A minute is a backstop, not the mechanism.
      staleTime: 60_000,
    });
  }
}

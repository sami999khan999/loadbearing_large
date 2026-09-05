import type { ApiClient, PaginationQuery } from "../import.js";
import { queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

// A defined query, never a raw client call from a component — the rule the ESLint ban on
// importing `api-client` elsewhere enforces.
export class RoleQueries {
  private constructor() {}

  public static list(client: ApiClient, params: PaginationQuery) {
    return queryOptions({
      // Mirrors the procedure path, so `QueryKeys.rbac.all()` invalidates this by prefix
      // along with everything else the slice caches.
      queryKey: QueryKeys.rbac.roles(params),
      queryFn: () => client.role.list(params),
      // A minute is a backstop against a second tab, not the mechanism: every edit goes
      // through a mutation that invalidates this key.
      staleTime: 60_000,
    });
  }
}

import type { ApiClient } from "../import.js";
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

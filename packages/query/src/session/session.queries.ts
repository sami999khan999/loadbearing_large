import { type AuthClient, queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

// Session gates everything else, so it lives in the same cache as everything else — the
// reason `api-client` wraps Better Auth's *vanilla* client.
export class SessionQueries {
  private constructor() {}

  public static current(auth: AuthClient) {
    return queryOptions({
      queryKey: QueryKeys.session.all(),
      queryFn: () => auth.session(),
      staleTime: 60_000,
      // Never. A signed-out user is an answer, not a failure to retry.
      retry: false,
    });
  }
}

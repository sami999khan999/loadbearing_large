import { type AuthClient, queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

// Session is the piece of state that gates everything else, so it lives in the same
// cache as everything else. That is the whole reason 18 wraps Better Auth's *vanilla*
// client — `better-auth/react` would be a second cache with its own invalidation rules,
// and the two disagree on sign-out.
export class SessionQueries {
  private constructor() {}

  public static current(auth: AuthClient) {
    return queryOptions({
      queryKey: QueryKeys.session,
      queryFn: () => auth.session(),
      staleTime: 60_000,
      // Never. A signed-out user is an answer, not a failure to retry.
      retry: false,
    });
  }
}

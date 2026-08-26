import type { AuthClient } from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

// A class of static hook factories is fine: the hook rules apply to the call site, and
// `SessionMutations.useSignIn(auth)` is called unconditionally at the top of a component.
export class SessionMutations {
  private constructor() {}

  public static useSignIn(auth: AuthClient) {
    return useAppMutation<void, { email: string; password: string }>({
      mutationFn: ({ email, password }) => auth.signIn(email, password),
      invalidates: [QueryKeys.session],
    });
  }

  // No `invalidates`. Sign-out has to clear the *entire* cache, and that belongs at the
  // call site — `queryClient.clear()` — because it is a lifecycle decision: the desktop
  // app may want to keep an offline cache across sign-out. Invalidating only `["session"]`
  // leaves every other query in memory, and the next person to sign in on that machine
  // sees a flash of the previous user's data.
  public static useSignOut(auth: AuthClient, onDone?: () => void) {
    return useAppMutation<void, void>({
      mutationFn: () => auth.signOut(),
      onSuccess: onDone,
    });
  }
}

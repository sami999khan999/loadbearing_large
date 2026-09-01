import type { AuthClient } from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

// A class of static hook factories is fine: the hook rules apply to the call site, and
// `SessionMutations.useSignIn(auth)` is called unconditionally at the top of a component.
//
// Everything an anonymous visitor can start. The signed-in half is `AccountMutations`.
export class SessionMutations {
  private constructor() {}

  public static useSignIn(auth: AuthClient) {
    return useAppMutation<void, { email: string; password: string }>({
      mutationFn: ({ email, password }) => auth.signIn(email, password),
      invalidates: [QueryKeys.session],
    });
  }

  // No `invalidates`, and that is not an omission. A successful sign-up issues no
  // session — verification is required and `autoSignIn` is off — so invalidating
  // `["session"]` here would refetch a session that is still, correctly, anonymous.
  public static useSignUp(auth: AuthClient) {
    return useAppMutation<
      void,
      { name: string; email: string; password: string; callbackURL: string }
    >({
      mutationFn: ({ name, email, password, callbackURL }) =>
        auth.signUp(name, email, password, callbackURL),
    });
  }

  // Also no `invalidates`. The success path here is a full-page navigation to Google,
  // so nothing in this cache survives to be invalidated — the session is picked up by
  // the root loader when the browser comes back to the callback URL.
  public static useSignInWithGoogle(auth: AuthClient) {
    return useAppMutation<void, { callbackURL: string; errorCallbackURL: string }>({
      mutationFn: ({ callbackURL, errorCallbackURL }) =>
        auth.signInWithGoogle(callbackURL, errorCallbackURL),
    });
  }

  // Resolves whether or not the address exists — see `AuthClient.requestPasswordReset`.
  // The form renders one message either way, and `isSuccess` is that signal.
  public static useRequestPasswordReset(auth: AuthClient) {
    return useAppMutation<void, { email: string; redirectTo: string }>({
      mutationFn: ({ email, redirectTo }) => auth.requestPasswordReset(email, redirectTo),
    });
  }

  // `revokeSessionsOnPasswordReset` is on, so every session this user had is gone by
  // the time this resolves — including, if they were somehow signed in, this one.
  public static useResetPassword(auth: AuthClient) {
    return useAppMutation<void, { token: string; newPassword: string }>({
      mutationFn: ({ token, newPassword }) => auth.resetPassword(token, newPassword),
      invalidates: [QueryKeys.session],
    });
  }

  public static useResendVerification(auth: AuthClient) {
    return useAppMutation<void, { email: string; callbackURL: string }>({
      mutationFn: ({ email, callbackURL }) => auth.sendVerificationEmail(email, callbackURL),
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

import type { AccountClient, TwoFactorEnrolment } from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

// Everything a signed-in person can change about their own account. The counterpart to
// `SessionMutations`, split on the same line `AccountClient` and `AuthClient` are.
export class AccountMutations {
  private constructor() {}

  // Invalidates the session list, not the session itself: `revokeOtherSessions` is set,
  // so every other device is gone and the list on screen is now wrong. This tab's own
  // session survives, which is why `QueryKeys.session` is absent.
  public static useChangePassword(account: AccountClient) {
    return useAppMutation<void, { currentPassword: string; newPassword: string }>({
      mutationFn: ({ currentPassword, newPassword }) =>
        account.changePassword(currentPassword, newPassword),
      invalidates: [QueryKeys.account.sessions()],
    });
  }

  // No invalidation. Nothing has changed yet — a confirmation has been sent to the old
  // address, and the address on the session only moves once that link is followed.
  public static useChangeEmail(account: AccountClient) {
    return useAppMutation<void, { newEmail: string; callbackURL: string }>({
      mutationFn: ({ newEmail, callbackURL }) => account.changeEmail(newEmail, callbackURL),
    });
  }

  // The rendered name lives on the session snapshot, so this is one of the few account
  // mutations that genuinely invalidates `["session"]`.
  public static useUpdateName(account: AccountClient) {
    return useAppMutation<void, { name: string }>({
      mutationFn: ({ name }) => account.updateName(name),
      invalidates: [QueryKeys.session],
    });
  }

  // Returns the enrolment, and invalidates nothing: two-factor is *not* on yet, and
  // `useVerifyTotpEnrolment` below is what finishes it. Invalidating here would make
  // the page claim protection the account does not have.
  public static useEnableTwoFactor(account: AccountClient) {
    return useAppMutation<TwoFactorEnrolment, { password: string }>({
      mutationFn: ({ password }) => account.enableTwoFactor(password),
    });
  }

  // The moment two-factor actually becomes true, so this is where the session is
  // invalidated — `user.twoFactorEnabled` is what the security page renders from.
  public static useVerifyTotpEnrolment(account: AccountClient) {
    return useAppMutation<void, { code: string }>({
      mutationFn: ({ code }) => account.verifyTotpEnrolment(code),
      invalidates: [QueryKeys.session, QueryKeys.account.all()],
    });
  }

  public static useDisableTwoFactor(account: AccountClient) {
    return useAppMutation<void, { password: string }>({
      mutationFn: ({ password }) => account.disableTwoFactor(password),
      invalidates: [QueryKeys.session, QueryKeys.account.all()],
    });
  }

  public static useRegenerateBackupCodes(account: AccountClient) {
    return useAppMutation<readonly string[], { password: string }>({
      mutationFn: ({ password }) => account.regenerateBackupCodes(password),
    });
  }

  // No invalidation: the success path is a redirect to Google, and the account list is
  // refetched by the settings page when the browser returns to it.
  public static useLinkGoogle(account: AccountClient) {
    return useAppMutation<void, { callbackURL: string }>({
      mutationFn: ({ callbackURL }) => account.linkGoogle(callbackURL),
    });
  }

  public static useUnlinkAccount(account: AccountClient) {
    return useAppMutation<void, { providerId: string; accountId: string }>({
      mutationFn: ({ providerId, accountId }) => account.unlinkAccount(providerId, accountId),
      invalidates: [QueryKeys.account.accounts()],
    });
  }

  public static useRevokeSession(account: AccountClient) {
    return useAppMutation<void, { token: string }>({
      mutationFn: ({ token }) => account.revokeSession(token),
      invalidates: [QueryKeys.account.sessions()],
    });
  }

  public static useRevokeOtherSessions(account: AccountClient) {
    return useAppMutation<void, void>({
      mutationFn: () => account.revokeOtherSessions(),
      invalidates: [QueryKeys.account.sessions()],
    });
  }
}

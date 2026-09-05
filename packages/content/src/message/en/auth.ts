// The copy for every flow `@loadbearing/auth` implements, plus a signed-in user
// managing their own account.
export const auth = {
  // ── sign-in ──
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  // Shown when the server refuses the sign-out: the session is still live, so the shell
  // must not act as though it is gone.
  "auth.signOutFailed": "Could not sign out. Please try again.",
  "auth.signingIn": "Signing in…",
  "auth.email": "Email",
  "auth.password": "Password",
  // Deliberately one sentence for both "no such account" and "wrong password".
  // Distinguishing them tells an attacker which addresses are registered.
  "auth.signInFailed": "That email and password did not match.",
  "auth.forgotPassword": "Forgot your password?",
  "auth.noAccount": "No account yet?",
  "auth.haveAccount": "Already have an account?",

  // ── sign-up ──
  "auth.signUp": "Create an account",
  "auth.signingUp": "Creating your account…",
  "auth.name": "Your name",
  "auth.confirmPassword": "Confirm password",
  "auth.passwordMismatch": "Those passwords do not match.",
  "auth.passwordTooShort": "Use at least 12 characters.",
  // The one place this system cannot avoid confirming an address is registered: the
  // alternative claims an account was created when it was not.
  "auth.emailTaken": "There is already an account with that email. Try signing in instead.",
  "auth.signUpFailed": "That account could not be created.",

  // ── verification ──
  "auth.verifyEmail": "Check your inbox to confirm your email address.",
  "auth.verifyEmailSent": "We sent a link to {email}. Open it to finish setting up your account.",
  "auth.verifyEmailResend": "Send it again",
  "auth.verifyEmailResent": "Sent. Give it a minute, then check your spam folder.",
  "auth.verifyEmailDone": "Your email address is confirmed. You can sign in now.",
  "auth.verifyEmailFailed": "That link has expired or has already been used.",

  // ── password reset ──
  "auth.resetRequest": "Send a reset link",
  // Shown whether or not the address exists, for the same reason `signInFailed` is
  // generic. The wording has to be true in both cases, which is why it says "if".
  "auth.resetSent": "If that email has an account, a reset link is on its way.",
  "auth.resetTitle": "Choose a new password",
  "auth.resetNewPassword": "New password",
  "auth.resetSubmit": "Save this password",
  "auth.resetDone": "Your password is saved. Sign in with it.",
  "auth.resetFailed": "That reset link has expired or has already been used.",

  // ── two-factor, at sign-in ──
  "auth.twoFactorCode": "Authentication code",
  "auth.twoFactorHint": "Enter the six-digit code from your authenticator app.",
  "auth.twoFactorUseBackup": "Use a backup code instead",
  "auth.twoFactorUseTotp": "Use your authenticator app instead",
  "auth.twoFactorUseOtp": "Email me a code instead",
  "auth.twoFactorBackupCode": "Backup code",
  "auth.twoFactorBackupHint": "Each backup code works once. Enter one you have not used.",
  "auth.twoFactorOtpSend": "Send a code to my email",
  "auth.twoFactorOtpSent": "We sent a code to your email address. It expires in five minutes.",
  "auth.twoFactorFailed": "That code was not right.",

  // ── two-factor, enrolment ──
  "auth.twoFactorTitle": "Two-factor authentication",
  "auth.twoFactorOff": "Off. Your password is the only thing protecting this account.",
  "auth.twoFactorOn": "On. You will be asked for a code when you sign in.",
  "auth.twoFactorEnable": "Turn on two-factor",
  "auth.twoFactorDisable": "Turn off two-factor",
  "auth.twoFactorConfirmPassword": "Confirm your password to continue",
  "auth.twoFactorScan": "Scan this with your authenticator app.",
  "auth.twoFactorManual": "Cannot scan? Enter this key by hand instead.",
  "auth.twoFactorVerifyPrompt": "Enter the code your app is showing now to finish.",
  "auth.twoFactorEnabled": "Two-factor is on.",
  "auth.twoFactorDisabled": "Two-factor is off.",

  // ── backup codes ──
  "auth.backupCodes": "Backup codes",
  // Shown once, at enrolment. The sentence has to carry the whole warning, because
  // there is no second chance to explain it.
  "auth.backupCodesHint":
    "Save these somewhere safe. Each one signs you in once if you lose your phone, and this is the only time they are shown.",
  "auth.backupCodesRegenerate": "Generate new backup codes",
  "auth.backupCodesRegenerated": "New codes. The old ones no longer work.",

  // ── social ──
  "auth.continueWithGoogle": "Continue with Google",
  "auth.orDivider": "or",
  "auth.socialFailed": "That sign-in did not complete.",

  // ── account ──
  "auth.account": "Account",
  "auth.security": "Security",
  "auth.profile": "Profile",
  "auth.saveChanges": "Save changes",
  "auth.saved": "Saved.",
  "auth.changePassword": "Change password",
  "auth.currentPassword": "Current password",
  "auth.changePasswordDone": "Your password is changed. Other devices have been signed out.",
  "auth.changePasswordFailed": "That current password was not right.",
  "auth.changeEmail": "Change email address",
  "auth.newEmail": "New email address",
  "auth.changeEmailSent":
    "We sent a confirmation to your current address. The change takes effect once you approve it there.",

  // ── organization ──
  // In `auth` because the switcher sits in the header of every signed-in page, and this
  // is the namespace that layout already loads.
  "auth.organization": "Organization",
  "auth.organizationNew": "New organization",

  // ── linked accounts ──
  "auth.linkedAccounts": "Linked accounts",
  "auth.linkedAccountsHint": "Other ways to sign in to this account.",
  "auth.linkGoogle": "Link a Google account",
  "auth.unlink": "Unlink",
  // Absent rather than disabled: unlinking the only credential is how someone locks
  // themselves out of their own account.
  "auth.unlinkLast": "This is the only way you can sign in, so it cannot be unlinked.",

  // ── sessions ──
  "auth.sessions": "Where you are signed in",
  "auth.sessionCurrent": "This device",
  "auth.sessionRevoke": "Sign out",
  // Does not promise immediacy: the cookie cache holds for up to a minute either way.
  "auth.signOutEverywhere": "Sign out on all devices",
  "auth.signOutEverywhereDone": "Every other device has been signed out.",
} as const;

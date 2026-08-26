// The copy for the flows `@loadbearing/auth` (16) actually implements: email and
// password sign-in, email verification, password reset, and two-factor.
export const auth = {
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "auth.signingIn": "Signing in…",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signInFailed": "That email and password did not match.",
  "auth.forgotPassword": "Forgot your password?",
  "auth.resetSent": "If that email has an account, a reset link is on its way.",
  "auth.verifyEmail": "Check your inbox to confirm your email address.",
  "auth.twoFactorCode": "Authentication code",
  "auth.twoFactorHint": "Enter the six-digit code from your authenticator app.",
  // The sign-out copy for a device that may be offline — see 16.9. Deliberately does
  // not promise immediacy, because a desktop session is revoked when it next connects.
  "auth.signOutEverywhere": "Sign out on all devices",
} as const;

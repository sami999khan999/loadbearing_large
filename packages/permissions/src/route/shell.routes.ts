import type { RoutePath } from "./index.js";

// App-level destinations that belong to no feature slice — platform-owned.
//
// A feature team has no reason to edit this file, which is the difference between
// it and the per-slice fragments beside it.
export const shellRoutes = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  // The two halves of a password reset. `forgotPassword` is where a link is asked for;
  // `resetPassword` is where Better Auth's own endpoint redirects with the token, so its
  // spelling here and the `redirectTo` the client sends have to agree.
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  // Where a verification link lands after Better Auth has consumed the token, and where
  // an unverified sign-up is told to go and look in its inbox.
  verifyEmail: "/verify-email",
  forbidden: "/forbidden",
  // Where an invitation link lands, with the token appended. Needs no session: the
  // person holding it may have no account yet. The mailer in `composition` builds the
  // link from this entry, so the two agree by construction.
  invitation: "/invitation",
} as const satisfies Record<string, RoutePath>;

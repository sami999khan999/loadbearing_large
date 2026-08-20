import type { RoutePath } from "./index.js";

/**
 * App-level destinations that belong to no feature slice — platform-owned.
 *
 * A feature team has no reason to edit this file, which is the difference between
 * it and the per-slice fragments beside it.
 */
export const shellRoutes = {
  home: "/",
  signIn: "/sign-in",
  forbidden: "/forbidden",
} as const satisfies Record<string, RoutePath>;

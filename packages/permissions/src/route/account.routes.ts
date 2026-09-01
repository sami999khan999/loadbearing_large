import type { RoutePath } from "./index.js";

// A signed-in user managing their own credentials. Deliberately carries no permission
// key and no gate: "may I change my own password?" is not a capability anyone can be
// denied, so the session check on the `(app)/_authenticated` layout is the whole gate.
export const accountRoutes = {
  security: "/settings/security",
  profile: "/settings/account",
} as const satisfies Record<string, RoutePath>;

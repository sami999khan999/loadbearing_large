import type { RoutePath } from "./index.js";

// Where a signed-in person founds a second tenant. Carries no permission key and no
// gate for the same reason `accountRoutes` does not: "may I create an organization of
// my own?" is not a capability anyone in *another* tenant can grant or deny.
export const organizationRoutes = {
  create: "/organization/new",
} as const satisfies Record<string, RoutePath>;

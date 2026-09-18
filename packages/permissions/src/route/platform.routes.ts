import type { RoutePath } from "./index.js";

export const platformRoutes = {
  status: "/platform/status",
  retention: "/platform/retention",
  analytics: "/platform/analytics",
  storage: "/platform/storage",
  shards: "/platform/shards",
} as const satisfies Record<string, RoutePath>;

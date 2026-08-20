import { rbacRoutes } from "./rbac.routes.js";
import { shellRoutes } from "./shell.routes.js";

/** Every declared path is rooted — a missing leading slash fails to compile. */
export type RoutePath = `/${string}`;

/**
 * The one table of destinations, read by every shell.
 *
 * Grouped by slice so a team owns one fragment, exactly as `CATALOG` and `GATES`
 * are. Web, desktop, and the Nest API all resolve against this table rather than
 * spelling paths themselves — a router's generated route tree cannot be the source,
 * because three of those four runtimes do not have one.
 */
export const ROUTES = {
  shell: shellRoutes,
  rbac: rbacRoutes,
  // ...task: taskRoutes,
  // ...finance: financeRoutes,
} as const;

/**
 * Union of every path the table declares.
 *
 * `Extract<…, string>` rather than a bare indexed access so a group may later hold
 * a builder for a parameterised route — `(id: string) => `/members/${id}`` — without
 * widening this union to include the function type. Builders exist because route
 * param syntax is not portable: TanStack writes `$id`, Next writes `[id]`, and a
 * builder returns a finished path instead of either.
 */
export type AppRoute = {
  [G in keyof typeof ROUTES]: Extract<(typeof ROUTES)[G][keyof (typeof ROUTES)[G]], string>;
}[keyof typeof ROUTES];

// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/application ─────────────────────────────────────────────────
export {
  type CacheStore,
  type CapabilityRepository,
  Principal,
  type RequestHeaders,
  type ResolvedSession,
  SessionResolver,
} from "@loadbearing/application";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export type { OrganizationId, UserId } from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { ServerOnly, Uuid } from "@loadbearing/core";

// ── @loadbearing/db ──────────────────────────────────────────────────────────
export { Database } from "@loadbearing/db";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export {
  CapabilitySet,
  type CapabilitySetDto,
  type PermissionKey,
  PermissionRegistry,
} from "@loadbearing/permissions";

// ── better-auth ──────────────────────────────────────────────────────────────
export { type BetterAuthOptions, betterAuth } from "better-auth";
export { drizzleAdapter } from "better-auth/adapters/drizzle";
export { getSchema } from "better-auth/db";
export { bearer, twoFactor } from "better-auth/plugins";

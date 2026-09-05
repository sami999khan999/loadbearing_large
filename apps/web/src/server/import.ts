// **The second of this app's two outside surfaces**, and the only place under
// `apps/web/src` allowed to name the server graph. See docs/reference/import-surfaces.md.

// ── @loadbearing/application ─────────────────────────────────────────────────
// Type-only. The principal is resolved by the container, never constructed here.
export type { Principal } from "@loadbearing/application";

// ── @loadbearing/composition ─────────────────────────────────────────────────
export { Container } from "@loadbearing/composition";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
// `contract` is the shape `appRouter` must mirror exactly, and `ProcedurePermissions`
// is the second of the four enforcement surfaces (23).
export {
  contract,
  ProcedurePermissions,
} from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
// `HTTP_STATUS` is a transport concern and this is a transport directory, which is the
// whole reason the lint rule bans the name for `packages/application/**` and not here.
export {
  ErrorNormalizer,
  ForbiddenError,
  HTTP_STATUS,
  UnauthorizedError,
} from "@loadbearing/errors";

// ── @loadbearing/observability ───────────────────────────────────────────────
export { Correlation, type Logger, type TraceId } from "@loadbearing/observability";

// ── @orpc/server ─────────────────────────────────────────────────────────────
export { createRouterClient, implement, ORPCError, os } from "@orpc/server";

// ── @orpc/server/fetch ───────────────────────────────────────────────────────
export { RPCHandler } from "@orpc/server/fetch";

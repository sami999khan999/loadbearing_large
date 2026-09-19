// **The second of this app's two outside surfaces**, and the only place under
// `apps/web/src` allowed to name the server graph. See docs/reference/import-surfaces.md.

// ── node ─────────────────────────────────────────────────────────────────────
// For the streaming wrap in `orpc/base.ts`: a snapshot taken inside the shard scope,
// called through on every frame. See packages/infrastructure/docs/reference/sharding.md.
export { AsyncLocalStorage } from "node:async_hooks";

// ── @loadbearing/application ─────────────────────────────────────────────────
// Type-only. The principal is resolved by the container, never constructed here.
export type { Principal } from "@loadbearing/application";

// ── @loadbearing/application ─────────────────────────────────────────────────
// The channel builder only. A router names no other domain type: everything else it
// touches, it reaches through a use-case on the container.
export { RealtimeChannels } from "@loadbearing/application";

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
// Never `EventPublisher` from here. It is oRPC's own in-process fan-out, and reaching
// for it would put a second, replica-local realtime path beside the Redis one.
export { createRouterClient, implement, ORPCError, os, withEventMeta } from "@orpc/server";

// ── @orpc/server/fetch ───────────────────────────────────────────────────────
export { RPCHandler } from "@orpc/server/fetch";

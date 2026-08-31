// Everything the transport layer takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// **The second of this app's two outside surfaces, and the reason there are two.**
// `apps/web/src/**` is banned from naming `@loadbearing/composition`, `application`,
// `auth`, `infrastructure` and the vendor SDKs beneath them; `apps/web/src/server/**` is
// the one exemption, because nothing that reads this file reaches a browser. Merging it
// into `~/import.ts` would hand every route component an edge into the server graph and
// leave the client bundle's cleanliness resting on tree-shaking — which is exactly what
// the three defences in 24 exist to avoid depending on.
//
// **The two `*.fn.ts` files beside it do not read this file, and that is the subtlety.**
// A server function is half client: the stub ships to the browser and only the handler
// body is stripped, so `session.fn.ts` is a live edge in the client graph. Importing
// this surface from there put `@tanstack/react-start/server` one hop from `__root.tsx`
// and Start's import protection denied the build, naming the whole chain. They take
// `~/import.ts` and two direct imports instead; `container.js` stays a relative import
// inside the handler, where the compiler removes it.
//
// Read as a list, this is the answer to "what does the transport layer touch?" — and a
// server-only package appearing on `~/import.ts` instead of here is the leak.

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

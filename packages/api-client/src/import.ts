// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// Read it as the answer to "what does the client actually depend on?" — and note what
// is absent. No UI framework and no cache library appear here, and none ever can: this
// package has to load in a plain Node script. The gate in 18 greps for exactly that.

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export type { AppContract } from "@loadbearing/contracts";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
// The transport is where a foreign error shape becomes one of ours, and this is the
// only package positioned to do it for the auth endpoints. It costs nothing to load:
// `errors` carries no runtime dependency of its own and no prose.
export { TwoFactorRequiredError, UnauthorizedError } from "@loadbearing/errors";

// ── @orpc/client ─────────────────────────────────────────────────────────────
export { createORPCClient } from "@orpc/client";
export { RPCLink } from "@orpc/client/fetch";

// ── @orpc/contract ───────────────────────────────────────────────────────────
export type { ContractRouterClient } from "@orpc/contract";

// ── better-auth ──────────────────────────────────────────────────────────────
export { createAuthClient } from "better-auth/client";
export { twoFactorClient } from "better-auth/client/plugins";

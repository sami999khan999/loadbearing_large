import { coreErrors } from "./core.errors.js";

/**
 * `expected` belongs in a log line — someone tried something they cannot do.
 * `unexpected` belongs in an alert — we are broken. Both are errors; only one
 * should wake anybody.
 */
export type ErrorSeverity = "expected" | "unexpected";

export interface ErrorMeta {
  /** Whether retrying the same call could produce a different answer. */
  readonly retryable: boolean;
  readonly severity: ErrorSeverity;
}

/**
 * The closed vocabulary of failures, merged from team-owned fragments exactly as
 * `CATALOG` is in `@loadbearing/permissions`.
 *
 * Metadata is deliberately transport-agnostic. `retryable` is a *fact about the
 * code*, not a policy: `query` reads it for its retry callback and the worker
 * reads the same field for BullMQ, so the two cannot disagree by convention.
 */
export const ERROR_CATALOG = {
  ...coreErrors,
  // ...billingErrors,
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

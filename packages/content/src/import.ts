// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/errors ───────────────────────────────────────────────
export type { ErrorCode, ErrorEnvelope, FieldViolation } from "@loadbearing/errors";

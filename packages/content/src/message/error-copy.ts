import type { ErrorCode, ErrorEnvelope, FieldViolation } from "../import.js";
import type { Translator } from "../translator/index.js";
import type { ShellMessageKey } from "./namespace.js";

// The only place in the repository where a failure gets words. `Record<ErrorCode, …>`
// makes it total; the value type is `ShellMessageKey` so a code can never be mapped
// into a lazily loaded namespace and render as its own raw key.
export const ERROR_COPY: Readonly<Record<ErrorCode, ShellMessageKey>> = {
  UNAUTHORIZED: "error.unauthorized",
  FORBIDDEN: "error.forbidden",
  NOT_FOUND: "error.notFound",
  CONFLICT: "error.conflict",
  BAD_REQUEST: "error.unexpected",
  TWO_FACTOR_REQUIRED: "error.twoFactorRequired",
  RATE_LIMITED: "error.rateLimited",
  UNAVAILABLE: "error.unexpected",
  INTERNAL: "error.unexpected",
  SERVER_ONLY: "error.serverOnly",
};

// Field-level rules from a `ValidationError`. Open where `ERROR_COPY` is closed — a
// rule name is whatever a schema produced. Anything unlisted falls back in `ErrorCopy`.
export const FIELD_RULE_COPY: Readonly<Record<string, ShellMessageKey>> = {
  required: "error.field.required",
  tooShort: "error.field.tooShort",
  tooLong: "error.field.tooLong",
  invalidFormat: "error.field.invalidFormat",
  invalid: "error.field.invalid",
};

// The seam an error page, boundary, or toast calls. Writes the unknown-rule fallback once.
export class ErrorCopy {
  private constructor() {}

  // Shown at the top of an error page. Interpolates the envelope's context.
  public static message(translator: Translator, envelope: ErrorEnvelope): string {
    return translator.t(ERROR_COPY[envelope.code], envelope.context);
  }

  // One sentence per violation, in envelope order. Empty for a non-validation error.
  public static fields(translator: Translator, envelope: ErrorEnvelope): readonly string[] {
    return (envelope.fields ?? []).map((violation) => ErrorCopy.field(translator, violation));
  }

  // `field` is merged into the params here — every `error.field.*` template opens with it.
  public static field(translator: Translator, violation: FieldViolation): string {
    return translator.t(FIELD_RULE_COPY[violation.rule] ?? "error.unexpected", {
      field: violation.field,
      ...violation.params,
    });
  }
}

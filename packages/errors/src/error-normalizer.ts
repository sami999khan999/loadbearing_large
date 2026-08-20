import { AppError } from "./app.error.js";
import { InternalError } from "./error/internal.error.js";
import { type SchemaIssue, ValidationError } from "./error/validation.error.js";

/**
 * The boundary every thrown value crosses before it is transported, logged, or
 * rendered. After this, the shape is known.
 */
export class ErrorNormalizer {
  private constructor() {}

  public static normalize(thrown: unknown): AppError {
    if (ErrorNormalizer.isAppError(thrown)) return thrown;
    if (ErrorNormalizer.isSchemaError(thrown)) return ValidationError.fromIssues(thrown.issues);
    return new InternalError(thrown);
  }

  /**
   * Structural, deliberately not `instanceof`.
   *
   * Two copies of this package in one process — a hoisting quirk, a bundled
   * dependency, an SSR/client boundary — produce two distinct class identities,
   * and `instanceof` silently answers `false` for an error that is obviously one
   * of ours. A known `code` plus a callable `toJSON` survives that.
   */
  private static isAppError(value: unknown): value is AppError {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as { code?: unknown; toJSON?: unknown };

    return (
      typeof candidate.code === "string" &&
      AppError.isKnownCode(candidate.code) &&
      typeof candidate.toJSON === "function"
    );
  }

  /** Anything Zod-shaped, matched structurally so this package stays dependency-free. */
  private static isSchemaError(value: unknown): value is { issues: readonly SchemaIssue[] } {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as { issues?: unknown };

    return (
      Array.isArray(candidate.issues) &&
      candidate.issues.every(
        (issue: unknown) =>
          typeof issue === "object" &&
          issue !== null &&
          Array.isArray((issue as { path?: unknown }).path) &&
          typeof (issue as { code?: unknown }).code === "string",
      )
    );
  }
}

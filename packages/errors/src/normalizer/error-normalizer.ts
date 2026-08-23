import { AppError, InternalError, type SchemaIssue, ValidationError } from "../error/index.js";

// The boundary every thrown value crosses before it is transported, logged, or rendered.
export class ErrorNormalizer {
  private constructor() {}

  public static normalize(thrown: unknown): AppError {
    if (ErrorNormalizer.isAppError(thrown)) return thrown;
    if (ErrorNormalizer.isSchemaError(thrown)) return ValidationError.fromIssues(thrown.issues);
    return new InternalError(thrown);
  }

  // Structural, not `instanceof` — two copies of this package have two class identities.
  private static isAppError(value: unknown): value is AppError {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as { code?: unknown; toJSON?: unknown };

    return (
      typeof candidate.code === "string" &&
      AppError.isKnownCode(candidate.code) &&
      typeof candidate.toJSON === "function"
    );
  }

  // Anything Zod-shaped, matched structurally so this package stays dependency-free.
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

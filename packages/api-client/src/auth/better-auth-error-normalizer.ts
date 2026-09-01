import {
  type AppError,
  ConflictError,
  InternalError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "../import.js";

// The shape Better Auth's client returns in its `error` field. Declared structurally
// rather than imported: the library's own error type is generic over the configured
// plugins, and this file only ever reads these three fields.
export interface BetterAuthError {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
  readonly message?: string | undefined;
}

// Better Auth's `SCREAMING_SNAKE` codes, mapped onto this repository's closed set.
// Only the ones a form branches on are listed; everything else falls through to the
// status, and then to `INTERNAL`.
const BY_CODE: Readonly<Record<string, () => AppError>> = {
  USER_ALREADY_EXISTS: () => new ConflictError("user", "email"),
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: () => new ConflictError("user", "email"),
  // One rule name for every way a token can be unusable. A user cannot act on the
  // difference between "expired" and "already used" — both mean "ask for a new one".
  INVALID_TOKEN: () => new ValidationError([{ field: "token", rule: "invalid" }]),
  TOKEN_EXPIRED: () => new ValidationError([{ field: "token", rule: "invalid" }]),
  INVALID_OR_EXPIRED_TOKEN: () => new ValidationError([{ field: "token", rule: "invalid" }]),
  PASSWORD_TOO_SHORT: () => new ValidationError([{ field: "password", rule: "tooShort" }]),
  PASSWORD_TOO_LONG: () => new ValidationError([{ field: "password", rule: "tooLong" }]),
};

// The transport is where a foreign error shape becomes one of ours, and this package is
// the only one positioned to do it for the auth endpoints.
//
// It is not cosmetic. `ErrorNormalizer` recognises an `AppError` structurally and maps
// everything else to `INTERNAL`, so a bare `Error` thrown here makes every branch a
// caller could write on the code unreachable — which is the bug T-005 closed once
// already for the two-factor fork.
export class BetterAuthErrorNormalizer {
  private constructor() {}

  public static normalize(error: BetterAuthError | null | undefined): AppError {
    const mapped = error?.code ? BY_CODE[error.code] : undefined;
    if (mapped) return mapped();

    // The status, not the message. `error.message` is Better Auth's English prose and
    // matching on it would break on their next release and in every locale but one.
    switch (error?.status) {
      case 429:
        return new RateLimitedError("auth");
      case 400:
        return new ValidationError([{ field: "", rule: "invalid" }]);
      case 401:
      case 403:
        return new UnauthorizedError("rejected");
      default:
        return new InternalError();
    }
  }
}

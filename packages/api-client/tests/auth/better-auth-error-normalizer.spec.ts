import { describe, expect, it } from "vitest";
import { BetterAuthErrorNormalizer } from "../../src/auth/better-auth-error-normalizer.js";

// `ErrorNormalizer` flattens anything that is not an `AppError` to `INTERNAL`, so a bare
// `Error` here makes every branch a caller writes on a code unreachable.
const codeOf = (error: unknown) => BetterAuthErrorNormalizer.normalize(error as never).code;

describe("BetterAuthErrorNormalizer — mapped codes", () => {
  it("turns an existing account into CONFLICT", () => {
    expect(codeOf({ code: "USER_ALREADY_EXISTS", status: 422 })).toBe("CONFLICT");
    expect(codeOf({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", status: 422 })).toBe("CONFLICT");
  });

  // One rule for every way a token can be unusable: three sentences for one recovery is
  // three chances to word one of them wrongly.
  it("collapses every unusable token into one field violation", () => {
    for (const code of ["INVALID_TOKEN", "TOKEN_EXPIRED", "INVALID_OR_EXPIRED_TOKEN"]) {
      const error = BetterAuthErrorNormalizer.normalize({ code, status: 400 } as never);

      expect(error.code).toBe("BAD_REQUEST");
      expect(error.fields).toEqual([{ field: "token", rule: "invalid" }]);
    }
  });

  it("reports a rejected password against the field that caused it", () => {
    const error = BetterAuthErrorNormalizer.normalize({
      code: "PASSWORD_TOO_SHORT",
      status: 400,
    } as never);

    expect(error.fields).toEqual([{ field: "password", rule: "tooShort" }]);
  });

  // The mapped code wins over the status: `USER_ALREADY_EXISTS` is a 4xx that would
  // otherwise fall through to a validation error.
  it("prefers the code over the status when both are present", () => {
    expect(codeOf({ code: "USER_ALREADY_EXISTS", status: 400 })).toBe("CONFLICT");
  });
});

describe("BetterAuthErrorNormalizer — status fallback", () => {
  // The status, never the message: `error.message` is English prose that breaks at their
  // next release and in every locale but one.
  it("maps a throttled request onto the retryable code", () => {
    const error = BetterAuthErrorNormalizer.normalize({ status: 429 } as never);

    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
  });

  it("maps both rejection statuses onto UNAUTHORIZED", () => {
    expect(codeOf({ status: 401 })).toBe("UNAUTHORIZED");
    expect(codeOf({ status: 403 })).toBe("UNAUTHORIZED");
  });

  it("maps an unrecognised rejection onto BAD_REQUEST", () => {
    expect(codeOf({ status: 400 })).toBe("BAD_REQUEST");
  });

  // Including `null` and `undefined` — the `!data` branch on every read in
  // `AccountClient` passes exactly that.
  it("maps everything it does not recognise onto INTERNAL", () => {
    expect(codeOf({ status: 500 })).toBe("INTERNAL");
    expect(codeOf({ code: "SOMETHING_NEW", status: 418 })).toBe("INTERNAL");
    expect(codeOf(null)).toBe("INTERNAL");
    expect(codeOf(undefined)).toBe("INTERNAL");
  });

  // Never prose, in any branch: `Error.message` *is* the code, so a smuggled sentence
  // puts untranslated English on screen wherever a caller renders it.
  it("never carries a message that is not the code", () => {
    const error = BetterAuthErrorNormalizer.normalize({
      status: 500,
      message: "Internal server error",
    } as never);

    expect(error.message).toBe("INTERNAL");
  });
});

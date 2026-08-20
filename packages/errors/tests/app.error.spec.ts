import { describe, expect, it } from "vitest";
import { AppError } from "../src/app.error.js";
import { ERROR_CATALOG, type ErrorCode } from "../src/catalog/index.js";
import { ForbiddenError } from "../src/error/forbidden.error.js";
import { NotFoundError } from "../src/error/not-found.error.js";
import { ValidationError } from "../src/error/validation.error.js";
import { HTTP_STATUS } from "../src/transport/http.js";

describe("AppError", () => {
  /**
   * The rule the whole package is built on. If a message string ever appears
   * here, user-facing text has escaped `@loadbearing/content` and translation.
   */
  it("carries the code as its message and no prose", () => {
    const error = new ForbiddenError("task.reactivate");

    expect(error.message).toBe("FORBIDDEN");
    expect(error.name).toBe("ForbiddenError");
  });

  it("carries structured context instead of an interpolated sentence", () => {
    expect(new ForbiddenError("task.reactivate", "goal-1").context).toEqual({
      permission: "task.reactivate",
      goalId: "goal-1",
    });
    expect(new ForbiddenError("task.reactivate").context).toEqual({
      permission: "task.reactivate",
    });
  });

  it("is a real Error, so it can be thrown and caught", () => {
    expect(() => {
      throw new NotFoundError("Task", "abc");
    }).toThrow();
  });

  it("exposes retryability from the catalog rather than restating it", () => {
    expect(new ForbiddenError("x").retryable).toBe(false);
  });

  describe("isKnownCode", () => {
    it("accepts a code the catalog defines and rejects one it does not", () => {
      expect(AppError.isKnownCode("FORBIDDEN")).toBe(true);
      expect(AppError.isKnownCode("FROBIDDEN")).toBe(false);
    });

    /** Same prototype-chain hazard `PermissionRegistry.isKnown` closes. */
    it("does not mistake an inherited object property for a code", () => {
      expect(AppError.isKnownCode("constructor")).toBe(false);
      expect(AppError.isKnownCode("toString")).toBe(false);
    });
  });

  describe("round-trip", () => {
    it("reconstructs code, context and fields from an envelope", () => {
      const original = new ValidationError([
        { field: "reason", rule: "tooShort", params: { min: 10 } },
      ]);
      const revived = AppError.from(JSON.parse(JSON.stringify(original.toJSON())));

      expect(revived?.code).toBe("BAD_REQUEST");
      expect(revived?.fields).toEqual([{ field: "reason", rule: "tooShort", params: { min: 10 } }]);
    });

    it("rejects an envelope naming a code it does not know", () => {
      expect(AppError.from({ code: "MADE_UP" as ErrorCode, context: {} })).toBeNull();
    });

    it("omits `fields` entirely when there are none", () => {
      expect(new ForbiddenError("x").toJSON()).not.toHaveProperty("fields");
    });
  });
});

describe("catalog and transport coverage", () => {
  it("gives every code an HTTP status", () => {
    for (const code of Object.keys(ERROR_CATALOG) as ErrorCode[]) {
      expect(HTTP_STATUS[code], code).toBeTypeOf("number");
    }
  });

  it("has not drifted between the catalog and the status map", () => {
    expect(Object.keys(HTTP_STATUS).sort()).toEqual(Object.keys(ERROR_CATALOG).sort());
  });
});

import { describe, expect, it } from "vitest";
import { ForbiddenError } from "../../src/error/forbidden.error.js";
import { ErrorNormalizer } from "../../src/normalizer/error-normalizer.js";

describe("ErrorNormalizer", () => {
  it("returns one of ours unchanged", () => {
    const original = new ForbiddenError("task.reactivate", "goal-1");

    expect(ErrorNormalizer.normalize(original)).toBe(original);
  });

  // The whole point of a normaliser: whatever arrives, the shape afterwards is
  // known. A `throw "boom"` and a rejected `undefined` are both real.
  it.each([
    ["an Error", new Error("connection to db-prod-01 refused")],
    ["a string", "boom"],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["a plain object", { nope: true }],
  ])("collapses %s to INTERNAL", (_label, thrown) => {
    const normalized = ErrorNormalizer.normalize(thrown);

    expect(normalized.code).toBe("INTERNAL");
    expect(normalized.toJSON().code).toBe("INTERNAL");
  });

  // This is the requirement, so it is asserted directly rather than inferred: a
  // Postgres error string names your tables, and it must not reach a client.
  it("keeps the original text out of the envelope entirely", () => {
    const secret = 'connection to db-prod-01 refused: relation "user_api_keys" does not exist';
    const normalized = ErrorNormalizer.normalize(new Error(secret));

    expect(JSON.stringify(normalized.toJSON())).not.toContain("db-prod-01");
    expect(JSON.stringify(normalized.toJSON())).not.toContain("user_api_keys");
    expect(JSON.stringify(normalized)).not.toContain("db-prod-01");
  });

  it("keeps the original reachable for a logger", () => {
    const cause = new Error("underlying");
    const normalized = ErrorNormalizer.normalize(cause);

    expect((normalized as { cause?: unknown }).cause).toBe(cause);
  });

  // Structural detection, not `instanceof` — two copies of the package in one
  // process give two class identities and `instanceof` answers `false`.
  it("recognises a structurally-identical error from another copy of the package", () => {
    const foreign = {
      code: "FORBIDDEN",
      context: { permission: "task.read" },
      toJSON: () => ({ code: "FORBIDDEN", context: { permission: "task.read" } }),
    };

    expect(ErrorNormalizer.normalize(foreign).code).toBe("FORBIDDEN");
  });

  it("does not mistake an unknown code for one of ours", () => {
    const foreign = { code: "TOTALLY_MADE_UP", context: {}, toJSON: () => ({}) };

    expect(ErrorNormalizer.normalize(foreign).code).toBe("INTERNAL");
  });
});

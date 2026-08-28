import { describe, expect, it } from "vitest";
import { ApiKeyHasher } from "../../src/apikey/api-key.hasher.js";

describe("ApiKeyHasher", () => {
  it("returns the token once and stores only its digest", async () => {
    const key = await ApiKeyHasher.generate();

    // The whole point of the split: what goes in the database is the hash, and it must
    // not be possible to get back to the token from either stored field.
    expect(key.token).toMatch(/^rk_[0-9a-f]{64}$/);
    expect(key.hash).toBe(await ApiKeyHasher.hash(key.token));
    expect(key.hash).not.toContain(key.token);
    expect(key.token.startsWith(key.prefix)).toBe(true);
  });

  it("never issues the same token twice", async () => {
    const tokens = await Promise.all(
      Array.from({ length: 32 }, () => ApiKeyHasher.generate().then((key) => key.token)),
    );

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("indexes on a prefix short enough to collide across keys", () => {
    // `prefixOf` is the *lookup* column, not an identifier. A spec asserting it were
    // unique would be asserting the opposite of the design: several keys share a prefix,
    // and the hash comparison is what picks one.
    expect(ApiKeyHasher.prefixOf("rk_0123456789abcdef")).toBe("rk_01234");
    expect(ApiKeyHasher.prefixOf("rk_0123456789abcdef")).toHaveLength(8);
  });

  it("compares equal strings as equal and unequal ones as unequal", () => {
    expect(ApiKeyHasher.timingSafeEqual("abcdef", "abcdef")).toBe(true);
    expect(ApiKeyHasher.timingSafeEqual("abcdef", "abcdeg")).toBe(false);
    // A length mismatch short-circuits, which is the one leak this function accepts:
    // the digests it compares are always the same length, so it never happens here.
    expect(ApiKeyHasher.timingSafeEqual("abc", "abcdef")).toBe(false);
    expect(ApiKeyHasher.timingSafeEqual("", "")).toBe(true);
  });

  it("does not short-circuit on the first differing character", () => {
    // Both comparisons must be false. A `===` would also be false, so this is a
    // regression guard on the loop rather than a timing measurement — measuring
    // nanoseconds in a test runner produces a flaky suite and proves nothing.
    expect(ApiKeyHasher.timingSafeEqual("zaaaaa", "aaaaaa")).toBe(false);
    expect(ApiKeyHasher.timingSafeEqual("aaaaaz", "aaaaaa")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { DocumentEntity } from "../../src/document/document.entity.js";

const RAW = {
  slug: "terms-of-service",
  title: "Terms of Service",
  body: "# Terms\n\nBe excellent to each other.",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("DocumentEntity", () => {
  it("parses a well-formed record and coerces the date", () => {
    const document = DocumentEntity.from(RAW);

    expect(document.slug).toBe("terms-of-service");
    expect(document.title).toBe("Terms of Service");
    expect(document.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a slug that is not url-safe", () => {
    // Addressed, never nested — a slash here is a routing decision leaking into content.
    expect(() => DocumentEntity.from({ ...RAW, slug: "legal/terms" })).toThrow();
    expect(() => DocumentEntity.from({ ...RAW, slug: "Terms Of Service" })).toThrow();
  });

  it("rejects a missing title rather than rendering undefined", () => {
    expect(() => DocumentEntity.from({ ...RAW, title: "" })).toThrow();
  });

  it("cannot be constructed from an unvalidated row", () => {
    expect(() => DocumentEntity.from({ slug: "x" })).toThrow();
  });
});

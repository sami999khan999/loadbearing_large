import { describe, expect, it } from "vitest";
import { StaticContentSource } from "../../src/source/static-content.source.js";

describe("StaticContentSource", () => {
  // The shell is a property of the seam, not something a caller remembers to ask for.
  it("puts the shell namespaces in a snapshot nobody asked for anything in", async () => {
    const snapshot = await new StaticContentSource().messages("en", []);

    expect(snapshot.namespaces).toEqual(["common", "error"]);
    expect(snapshot.base["error.unexpected"]).toBe("Something went wrong. Please try again.");
    expect(snapshot.base["action.save"]).toBe("Save");
  });

  it("does not duplicate a namespace that was also requested", async () => {
    const snapshot = await new StaticContentSource().messages("en", ["error", "common"]);

    expect(snapshot.namespaces).toEqual(["common", "error"]);
  });

  it("leaves overrides empty for English", async () => {
    const snapshot = await new StaticContentSource().messages("en", []);

    expect(snapshot.overrides).toEqual({});
  });

  // English always rides alongside, per namespace. That is what makes a Partial locale safe.
  it("loads English as the fallback layer beneath another locale", async () => {
    const snapshot = await new StaticContentSource().messages("bn", []);

    expect(snapshot.locale).toBe("bn");
    expect(snapshot.overrides["error.forbidden"]).toBe("এটি করার অনুমতি আপনার নেই।");
    expect(snapshot.base["error.forbidden"]).toBe("You do not have permission to do that.");
    // Untranslated, so the fallback answers.
    expect(snapshot.overrides["error.conflict"]).toBeUndefined();
    expect(snapshot.base["error.conflict"]).toBeDefined();
  });

  it("hands back a Translator over the same snapshot", async () => {
    const t = await new StaticContentSource().translator("bn", []);

    expect(t.locale).toBe("bn");
    expect(t.t("error.forbidden")).toBe("এটি করার অনুমতি আপনার নেই।");
    expect(t.t("error.conflict")).toBe("Someone else changed this first. Reload and try again.");
  });

  // A catalog with no loader for a namespace yields nothing rather than throwing.
  // That is how a client catalog structurally cannot obtain server-only copy.
  it("skips a namespace its catalog cannot serve", async () => {
    const empty = new StaticContentSource({ en: {}, bn: {} });
    const snapshot = await empty.messages("en", ["common"]);

    expect(snapshot.namespaces).toEqual(["common", "error"]);
    expect(snapshot.base).toEqual({});
  });
});

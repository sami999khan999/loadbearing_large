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

  // English always rides alongside, per namespace — two layers, not one merged map.
  it("loads English as the fallback layer beneath another locale", async () => {
    const snapshot = await new StaticContentSource().messages("bn", []);

    expect(snapshot.locale).toBe("bn");
    expect(snapshot.overrides["error.forbidden"]).toBe("এটি করার অনুমতি আপনার নেই।");
    expect(snapshot.base["error.forbidden"]).toBe("You do not have permission to do that.");
  });

  it("hands back a Translator over the same snapshot", async () => {
    const t = await new StaticContentSource().translator("bn", []);

    expect(t.locale).toBe("bn");
    expect(t.t("error.forbidden")).toBe("এটি করার অনুমতি আপনার নেই।");
  });

  // A fixture catalog, not the real `bn`: `NamespaceBundle` is total, so a shipped
  // bundle cannot have the gap this needs.
  it("falls back per key when a locale's bundle is missing one", async () => {
    const partial = new StaticContentSource({
      en: {
        common: async () => ({ "action.save": "Save", "action.cancel": "Cancel" }),
        error: async () => ({ "error.forbidden": "You do not have permission to do that." }),
      },
      bn: {
        common: async () => ({ "action.save": "সংরক্ষণ" }),
        error: async () => ({}),
      },
    });

    const t = await partial.translator("bn", []);

    expect(t.t("action.save")).toBe("সংরক্ষণ");
    // Per key, not per namespace: the layer below still answers inside a bundle the
    // locale did supply.
    expect(t.t("action.cancel")).toBe("Cancel");
    expect(t.t("error.forbidden")).toBe("You do not have permission to do that.");
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

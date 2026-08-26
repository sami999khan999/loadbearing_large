import { describe, expect, it } from "vitest";
import { FontRegistry } from "../../src/theme/font-registry.js";
import { ThemeRegistry } from "../../src/theme/theme-registry.js";

describe("ThemeRegistry", () => {
  it("names every theme the stylesheet declares", () => {
    expect(ThemeRegistry.all()).toEqual(["light", "dark"]);
  });

  it("defaults to light", () => {
    expect(ThemeRegistry.DEFAULT).toBe("light");
  });

  it("sets both the attribute and the colour scheme", () => {
    // `colorScheme` is what makes native scrollbars, form controls and date pickers
    // match. Without it a dark theme has light scrollbars.
    const root = document.createElement("html");
    ThemeRegistry.apply(root, "dark");

    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("does not admit a prototype member", () => {
    // `Object.hasOwn`, not `in`. This guard is what a stored preference crosses, so
    // `"toString"` passing it would make `meta()` return a function.
    expect(ThemeRegistry.isKnown("toString")).toBe(false);
    expect(ThemeRegistry.isKnown("constructor")).toBe(false);
    expect(ThemeRegistry.isKnown("dark")).toBe(true);
    expect(ThemeRegistry.isKnown("solarized")).toBe(false);
  });
});

describe("FontRegistry", () => {
  it("overrides the token rather than restyling anything", () => {
    const root = document.createElement("html");
    FontRegistry.apply(root, "mono");

    expect(root.style.getPropertyValue("--font-sans")).toBe(FontRegistry.meta("mono").stack);
  });

  it("ships a full stack per face, fallbacks included", () => {
    for (const key of FontRegistry.all()) {
      expect(FontRegistry.meta(key).stack).toContain(",");
    }
  });

  it("does not admit a prototype member either", () => {
    expect(FontRegistry.isKnown("valueOf")).toBe(false);
  });
});

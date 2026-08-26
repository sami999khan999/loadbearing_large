import { ImageManifest } from "@loadbearing/asset";
import { describe, expect, it } from "vitest";
import { navItems } from "../../src/collection/index.js";
import { StaticContentSource } from "../../src/source/static.content-source.js";

const source = new StaticContentSource();

describe("lazy namespaces", () => {
  it("loads a namespace a route declares, alongside the shell", async () => {
    const snapshot = await source.messages("en", ["auth"]);

    expect(snapshot.namespaces).toEqual(["common", "error", "auth"]);
    expect(snapshot.base["auth.signIn"]).toBe("Sign in");
  });

  it("does not load a namespace nobody asked for", async () => {
    const snapshot = await source.messages("en", ["auth"]);

    expect(snapshot.namespaces).not.toContain("nav");
    expect(snapshot.base["nav.roles"]).toBeUndefined();
  });

  // The documented failure mode, and the reason it is the right one: `nav.roles` on
  // screen names the exact string to grep for, and the bug is a route that forgot to
  // declare a namespace — not a translation problem.
  it("renders the key itself for an undeclared namespace", async () => {
    const t = await source.translator("en", []);

    expect(t.t("nav.roles")).toBe("nav.roles");
    expect(t.loaded("nav")).toBe(false);
  });

  it("falls back to English inside a lazy namespace too", async () => {
    const t = await source.translator("bn", ["auth"]);

    expect(t.t("auth.signIn")).toBe("সাইন ইন");
    // Untranslated in bn/auth.ts, so the fallback layer answers.
    expect(t.t("auth.signingIn")).toBe("Signing in…");
  });

  it("keeps error copy working on a route that declared something else", async () => {
    // `ERROR_COPY` is typed against `ShellMessageKey` precisely so this cannot break.
    const t = await source.translator("bn", ["nav"]);

    expect(t.t("error.forbidden")).toBe("এটি করার অনুমতি আপনার নেই।");
  });
});

describe("the other three shapes", () => {
  it("resolves media through the manifest", async () => {
    expect(await source.media("brand.logo")).toEqual(ImageManifest.get("brand.logo"));
  });

  it("hands back the nav collection", async () => {
    expect(await source.nav()).toEqual(navItems);
  });

  // Not a stub that throws. There are no static documents — the shape exists to come
  // from a database, and a missing slug is a 404 rather than an exception.
  it("has no documents", async () => {
    expect(await source.document("terms-of-service")).toBeNull();
  });
});

import { ImageManifest } from "@loadbearing/asset";
import { describe, expect, it } from "vitest";
import { navItems } from "../../src/collection/index.js";
import { SERVER_CATALOG } from "../../src/message/index.js";
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

// The split doc 20 promised, tested against the two real catalogs rather than a
// hand-built empty one. That is the case that actually matters.
describe("the server-only email namespace", () => {
  const server = new StaticContentSource(SERVER_CATALOG);

  it("serves email copy from the server catalog", async () => {
    const t = await server.translator("en", ["email"]);

    expect(t.t("email.digest.subject", { count: 3 })).toBe("Your daily digest — 3 updates");
  });

  it("still carries the shell, so an escalation notice already has error copy", async () => {
    const snapshot = await server.messages("en", ["email"]);

    expect(snapshot.namespaces).toEqual(["common", "error", "email"]);
    expect(snapshot.base["error.conflict"]).toBeDefined();
  });

  it("falls back to English inside the email namespace too", async () => {
    const t = await server.translator("bn", ["email"]);

    expect(t.t("email.digest.viewAll")).toBe("ড্যাশবোর্ড খুলুন");
    // Untranslated in bn/email.ts, so the fallback layer answers.
    expect(t.t("email.digest.unsubscribe")).toBe("Change how often you hear from us");
  });

  // A client catalog has no email loader at all, so the lookup is skipped rather than
  // thrown on and `t()` renders the key. A browser cannot obtain email copy by asking.
  it("yields nothing when a client source is asked for it by name", async () => {
    const t = await source.translator("en", ["email"]);

    expect(t.t("email.digest.subject", { count: 3 })).toBe("email.digest.subject");
  });
});

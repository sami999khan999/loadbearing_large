import { describe, expect, it } from "vitest";
import { type AppearanceSnapshot, AppearanceStore } from "../../src/store/appearance.store.js";

// The function that decides what `__root.tsx` writes onto <html>. Every case below is a
// request the server actually has to answer before the first byte.
const parse = (cookie: string | null, prefersDark = false): AppearanceSnapshot =>
  AppearanceStore.fromCookieHeader(cookie, prefersDark);

describe("AppearanceStore.fromCookieHeader", () => {
  it("falls back to the palette that seeds :root when there is no cookie", () => {
    expect(parse(null)).toEqual({ theme: "slate", mode: "light", preference: "system" });
  });

  it("reads a palette and a mode back out", () => {
    expect(parse("theme=ocean; mode=dark")).toEqual({
      theme: "ocean",
      mode: "dark",
      preference: "dark",
    });
  });

  it("ignores everything it does not recognise", () => {
    // A cookie is a string the user can edit. An unknown key renders a page with every
    // colour undefined, so neither value is trusted before its guard has run.
    expect(parse("theme=solarized; mode=sepia").theme).toBe("slate");
    expect(parse("theme=solarized; mode=sepia").mode).toBe("light");
  });

  it("does not admit a prototype member from a cookie", () => {
    // The same `Object.hasOwn` guard the registries pin, checked at the boundary the
    // untrusted string actually crosses.
    expect(parse("theme=__proto__; mode=toString").theme).toBe("slate");
    expect(parse("theme=constructor; mode=constructor").mode).toBe("light");
  });

  it("resolves system against the client hint, not against a guess", () => {
    expect(parse("theme=forest; mode=system", true).mode).toBe("dark");
    expect(parse("theme=forest; mode=system", false).mode).toBe("light");
    expect(parse("theme=forest; mode=system", true).preference).toBe("system");
  });

  it("lets an explicit choice outrank the operating system", () => {
    expect(parse("theme=forest; mode=light", true).mode).toBe("light");
  });

  it("never hands a dark-only palette a light mode", () => {
    // Both routes into it: an explicit light choice, and a system preference on a light
    // machine. Either would match no selector at all.
    expect(parse("theme=midnight; mode=light").mode).toBe("dark");
    expect(parse("theme=midnight; mode=system", false).mode).toBe("dark");
  });

  it("survives a cookie header carrying other things", () => {
    expect(parse("app.session=abc; theme=plum; other=1; mode=dark").theme).toBe("plum");
    expect(parse("app.session=abc; theme=plum; other=1; mode=dark").mode).toBe("dark");
  });

  it("does not match a cookie whose name merely ends in the one it wants", () => {
    // `split("=")` on `"other-theme=ocean"` yields the key `other-theme`, not `theme`.
    expect(parse("other-theme=ocean").theme).toBe("slate");
  });
});

describe("AppearanceStore", () => {
  it("resolves once and then stops asking", async () => {
    // Same contract as `SessionStore`: `restore()` marks it resolved before the first
    // client render, so hydration and every navigation after it are a no-op.
    let calls = 0;
    const store = new AppearanceStore();
    const load = (): Promise<AppearanceSnapshot> => {
      calls += 1;
      return Promise.resolve(parse("theme=ocean; mode=dark"));
    };

    await store.ensure(load);
    await store.ensure(load);

    expect(calls).toBe(1);
    expect(store.current.theme).toBe("ocean");
  });

  it("shares one request between concurrent matches rather than racing two", async () => {
    let calls = 0;
    const store = new AppearanceStore();
    const load = (): Promise<AppearanceSnapshot> => {
      calls += 1;
      return Promise.resolve(parse("theme=forest; mode=light"));
    };

    await Promise.all([store.ensure(load), store.ensure(load)]);

    expect(calls).toBe(1);
  });

  it("round-trips through the SSR payload", () => {
    const store = new AppearanceStore();
    store.restore({ theme: "plum", mode: "dark", preference: "system" });

    expect(store.dehydrate()).toEqual({ theme: "plum", mode: "dark", preference: "system" });
  });
});

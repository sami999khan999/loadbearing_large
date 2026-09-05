import { afterEach, describe, expect, it, vi } from "vitest";
import { Endpoint } from "../src/endpoint.js";

describe("Endpoint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("addresses both entrypoints as same-origin paths", () => {
    // Same-origin, so there is no host to configure. Literals again in the route files,
    // which the generator reads without executing.
    expect(Endpoint.rpc).toBe("/api/rpc");
    expect(Endpoint.authPath).toBe("/api/auth");
  });

  it("returns an absolute URL under SSR, because Better Auth's client cannot take a path", () => {
    // `createAuthClient` resolves `baseURL` in its constructor, so a relative value
    // throws during SSR and blanks the page behind a failed Suspense boundary.
    expect(() => new URL(Endpoint.auth)).not.toThrow();
  });

  it("points the SSR fallback at a host that is guaranteed never to resolve", () => {
    // `.invalid` is reserved by RFC 2606, so a call that slips into SSR fails loudly
    // rather than quietly reaching some other localhost.
    expect(new URL(Endpoint.auth).hostname.endsWith(".invalid")).toBe(true);
    expect(Endpoint.auth.endsWith(Endpoint.authPath)).toBe(true);
  });

  it("uses the browser's own origin once there is one", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.example" } });

    expect(Endpoint.auth).toBe("https://app.example/api/auth");
  });
});

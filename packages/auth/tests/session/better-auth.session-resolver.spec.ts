import { describe, expect, it } from "vitest";
import type { AuthInstance } from "../../src/auth.factory.js";
import { BetterAuthSessionResolver } from "../../src/session/better-auth.session-resolver.js";

// Better Auth's real instance needs a database, a cache and a secret. This resolver's
// whole job is the shape it reads back, so the double is the API surface it touches and
// nothing else — a cast rather than a fixture stack that would test the library.
function resolverReturning(result: unknown): BetterAuthSessionResolver {
  return new BetterAuthSessionResolver({
    api: { getSession: () => Promise.resolve(result) },
  } as unknown as AuthInstance);
}

const HEADERS = new Headers();

describe("BetterAuthSessionResolver", () => {
  it("returns null when there is no session", async () => {
    expect(await resolverReturning(null).resolve(HEADERS)).toBeNull();
  });

  it("refuses a session with no active organization rather than defaulting one", async () => {
    const resolver = resolverReturning({
      session: { id: "s1", userId: "u1", expiresAt: new Date().toISOString() },
      user: { id: "u1" },
    });

    // A session written before the create hook existed, or by hand. Guessing a tenant
    // here is a cross-tenant read with no error anywhere downstream, so "no tenant" has
    // to mean "no session".
    expect(await resolver.resolve(HEADERS)).toBeNull();
  });

  it("carries the pinned organization through", async () => {
    const expires = new Date("2026-06-01T00:00:00Z");
    const resolver = resolverReturning({
      session: {
        id: "s1",
        userId: "u1",
        activeOrganizationId: "org-1",
        expiresAt: expires.toISOString(),
      },
      user: { id: "u1" },
    });

    expect(await resolver.resolve(HEADERS)).toEqual({
      organizationId: "org-1",
      userId: "u1",
      sessionId: "s1",
      expiresAt: expires,
    });
  });
});

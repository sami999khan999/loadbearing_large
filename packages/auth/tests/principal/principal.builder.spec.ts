import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { ApiKeyHasher } from "../../src/apikey/api-key.hasher.js";
import { type ApiKeyRecord, ApiKeyResolver } from "../../src/apikey/api-key.resolver.js";
import { CapabilityCache } from "../../src/principal/capability.cache.js";
import { PrincipalBuilder } from "../../src/principal/principal.builder.js";
import {
  headers,
  MapCacheStore,
  RecordingCapabilityRepository,
  StubApiKeyRepository,
  StubSessionResolver,
} from "../support/doubles.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const COOKIE_USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const KEY_ISSUER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");

const TOKEN = "rk_2222222222222222222222222222222222222222222222222222222222222222";

function holding(...grants: readonly PermissionKey[]): CapabilitySet {
  return CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} });
}

async function build(options: {
  readonly session: boolean;
  readonly keys?: readonly ApiKeyRecord[];
}) {
  const sessions = new StubSessionResolver(
    options.session
      ? {
          organizationId: ORG,
          userId: COOKIE_USER,
          sessionId: "session-1",
          expiresAt: new Date(Date.now() + 3_600_000),
        }
      : null,
  );

  const capabilities = new CapabilityCache(
    new RecordingCapabilityRepository(
      new Map([
        // The cookie holds everything; the key's issuer holds one permission. That gap
        // is what makes "which credential won" observable.
        [`${ORG}:${COOKIE_USER}`, holding("rbac.role.read", "rbac.role.manage", "member.read")],
        [`${ORG}:${KEY_ISSUER}`, holding("member.read")],
      ]),
    ),
    new MapCacheStore(),
  );

  const keyRepository = new StubApiKeyRepository(options.keys ?? []);
  const builder = new PrincipalBuilder(
    sessions,
    new ApiKeyResolver(keyRepository, capabilities),
    capabilities,
  );

  return { builder, sessions, keyRepository };
}

async function keyRecord(): Promise<ApiKeyRecord> {
  return {
    id: "key-1",
    organizationId: ORG,
    issuerId: KEY_ISSUER,
    tokenHash: await ApiKeyHasher.hash(TOKEN),
    scopes: ["member.read"],
    expiresAt: null,
    revokedAt: null,
  };
}

describe("PrincipalBuilder", () => {
  it("builds a user principal from a session", async () => {
    const { builder } = await build({ session: true });

    const principal = await builder.fromHeaders(headers());

    expect(principal?.kind).toBe("user");
    expect(principal?.userId).toBe(COOKIE_USER);
    expect(principal?.can("rbac.role.manage")).toBe(true);
  });

  it("returns null when there is no credential of any kind", async () => {
    const { builder } = await build({ session: false });

    expect(await builder.fromHeaders(headers())).toBeNull();
  });

  it("checks the api key before the cookie when a request carries both", async () => {
    const { builder, sessions } = await build({ session: true, keys: [await keyRecord()] });

    const principal = await builder.fromHeaders(headers({ "x-api-key": TOKEN }));

    // An integration calling from a browser context sends both. Checking the session
    // first would silently upgrade a key scoped to `member.read` to the signed-in
    // user's full permissions — the key is the more specific credential and must win.
    expect(principal?.kind).toBe("api_key");
    expect(principal?.userId).toBe(KEY_ISSUER);
    expect(principal?.can("member.read")).toBe(true);
    expect(principal?.can("rbac.role.manage")).toBe(false);
    // And the session is never even resolved, so the cookie cannot influence the answer.
    expect(sessions.calls).toBe(0);
  });

  it("does not fall back to the cookie when the api key is rejected", async () => {
    const revoked = { ...(await keyRecord()), revokedAt: new Date("2026-01-01T00:00:00Z") };
    const { builder } = await build({ session: true, keys: [revoked] });

    // Falling through to the session here would turn a revoked integration key into a
    // working request whenever the caller happened to also hold a browser session.
    expect(await builder.fromHeaders(headers({ "x-api-key": TOKEN }))).toBeNull();
  });
});

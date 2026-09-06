import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { CapabilityCache } from "../../src/principal/capability.cache.js";
import { MapCacheStore, RecordingCapabilityRepository } from "../support/doubles.js";

const ORG_A = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-0000000000a1");
const ORG_B = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-0000000000b1");
const USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

function holding(...grants: readonly PermissionKey[]): CapabilitySet {
  return CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} });
}

function cacheWith(sets: ReadonlyMap<string, CapabilitySet>) {
  const repository = new RecordingCapabilityRepository(sets);
  const store = new MapCacheStore();
  return { repository, store, cache: new CapabilityCache(repository, store) };
}

describe("CapabilityCache", () => {
  it("asks the repository once and serves the second read from the cache", async () => {
    const { cache, repository } = cacheWith(
      new Map([[`${ORG_A}:${USER}`, holding("rbac.role.read")]]),
    );

    expect((await cache.forUser(ORG_A, USER)).can("rbac.role.read")).toBe(true);
    expect((await cache.forUser(ORG_A, USER)).can("rbac.role.read")).toBe(true);

    // `resolveFor` is three queries and runs on essentially every request. One call is
    // the entire reason this class exists.
    expect(repository.calls).toHaveLength(1);
  });

  it("keys on organization and user, so the same person in two tenants gets two answers", async () => {
    const { cache, repository } = cacheWith(
      new Map([
        [`${ORG_A}:${USER}`, holding("rbac.role.read", "rbac.role.manage")],
        [`${ORG_B}:${USER}`, holding("member.read")],
      ]),
    );

    const inA = await cache.forUser(ORG_A, USER);
    const inB = await cache.forUser(ORG_B, USER);

    // Keyed on the user alone, this person carries organization A's permissions into B —
    // a cross-tenant privilege bug with a one-minute fuse and no error anywhere.
    expect(inA.can("rbac.role.manage")).toBe(true);
    expect(inB.can("rbac.role.manage")).toBe(false);
    expect(inB.can("member.read")).toBe(true);
    expect(repository.calls).toHaveLength(2);
  });

  it("writes the organization between the fixed prefix and the user id", async () => {
    const { cache, store } = cacheWith(new Map([[`${ORG_A}:${USER}`, holding("member.read")]]));
    await cache.forUser(ORG_A, USER);

    // The position matters as much as the presence: `invalidateOrganization` deletes by
    // prefix, so the tenant has to sit between the fixed part and the user id.
    expect([...store.entries.keys()]).toEqual([`capability:user:${ORG_A}:${USER}`]);
  });

  it("drops one entry on invalidate and leaves the other tenant's alone", async () => {
    const { cache, store } = cacheWith(
      new Map([
        [`${ORG_A}:${USER}`, holding("member.read")],
        [`${ORG_B}:${USER}`, holding("member.read")],
      ]),
    );

    await cache.forUser(ORG_A, USER);
    await cache.forUser(ORG_B, USER);
    await cache.invalidate(ORG_A, USER);

    expect([...store.entries.keys()]).toEqual([`capability:user:${ORG_B}:${USER}`]);
  });

  it("flushes one tenant on invalidateOrganization and leaves the other standing", async () => {
    const { cache, store } = cacheWith(
      new Map([
        [`${ORG_A}:${USER}`, holding("member.read")],
        [`${ORG_B}:${USER}`, holding("member.read")],
      ]),
    );

    await cache.forUser(ORG_A, USER);
    await cache.forUser(ORG_B, USER);
    store.entries.set("unrelated:key", "kept");

    // A role edit affects everyone holding it — cheaper to flush than to enumerate. The
    // tenant in the prefix is what keeps the flush inside the organization that changed.
    await cache.invalidateOrganization(ORG_A);

    expect([...store.entries.keys()]).toEqual([
      `capability:user:${ORG_B}:${USER}`,
      "unrelated:key",
    ]);
  });

  it("re-reads the repository after an invalidation", async () => {
    const { cache, repository } = cacheWith(
      new Map([[`${ORG_A}:${USER}`, holding("member.read")]]),
    );

    await cache.forUser(ORG_A, USER);
    await cache.invalidate(ORG_A, USER);
    await cache.forUser(ORG_A, USER);

    // Getting this wrong in the stale direction means a revoked permission keeps
    // working, which is a security bug wearing a caching bug's clothes.
    expect(repository.calls).toHaveLength(2);
  });
});

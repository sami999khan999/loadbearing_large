import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { type SessionSnapshot, SessionStore } from "../../src/store/session.store.js";

const OWNER: SessionSnapshot = {
  user: {
    id: "u1",
    email: "owner@example.com",
    name: "Owner",
    activeOrganizationId: "o1",
    organizations: [{ id: "o1", name: "Owner Org" }],
  },
  capabilities: CapabilitySet.from({
    wildcard: false,
    org: { grants: ["rbac.role.read"], denies: [] },
    goals: {},
  }).toJSON(),
};

function counting(snapshot: SessionSnapshot) {
  let calls = 0;
  return {
    calls: () => calls,
    load: () => {
      calls += 1;
      return Promise.resolve(snapshot);
    },
  };
}

describe("SessionStore", () => {
  it("starts signed out and denying everything", () => {
    const store = new SessionStore();

    // There is no loading state that grants access (23), so the initial value is the
    // safe one and resolution only ever widens it.
    expect(store.user).toBeNull();
    expect(CapabilitySet.from(store.dto).can("rbac.role.read")).toBe(false);
  });

  it("resolves once and never asks again", async () => {
    const store = new SessionStore();
    const loader = counting(OWNER);

    await store.ensure(loader.load);
    await store.ensure(loader.load);

    expect(loader.calls()).toBe(1);
    expect(store.user?.email).toBe("owner@example.com");
  });

  it("shares one request between concurrent callers", async () => {
    const store = new SessionStore();
    const loader = counting(OWNER);

    await Promise.all([store.ensure(loader.load), store.ensure(loader.load)]);

    // Two route matches resolving in the same tick must not become two round trips.
    expect(loader.calls()).toBe(1);
  });

  it("treats a restored snapshot as already resolved", async () => {
    const store = new SessionStore();
    const loader = counting(OWNER);

    store.restore(OWNER);
    await store.ensure(loader.load);

    // This is what keeps the browser from re-fetching during hydration: `hydrate` runs
    // before the first client render, so the root's `beforeLoad` pass is a no-op.
    expect(loader.calls()).toBe(0);
    expect(store.dehydrate()).toEqual(OWNER);
  });

  it("asks again after an invalidation, keeping the old answer until the new one lands", async () => {
    const store = new SessionStore();
    const loader = counting(OWNER);

    await store.ensure(loader.load);
    store.invalidate();

    // The cookie has changed and nothing else knows. Without this, a sign-in would
    // leave the shell rendering signed-out for the rest of the tab's life — but the
    // store must not flash anonymous in the meantime either.
    expect(store.user?.email).toBe("owner@example.com");

    await store.ensure(loader.load);
    expect(loader.calls()).toBe(2);
  });
});

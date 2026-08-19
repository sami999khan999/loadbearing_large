import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilitySet } from "../src/capability-set.js";
import { PermissionRegistry } from "../src/permission-registry.js";

const GOAL = "018f8c00-0000-7000-8000-000000000001";
const OTHER_GOAL = "018f8c00-0000-7000-8000-000000000002";

/**
 * Every key the shipped catalog defines is org-scoped, so the goal-scoped branch
 * of `can()` is unreachable through it. Stubbing `scopeOf` tests that branch now
 * instead of leaving rule 3 unverified until a slice adds a goal-scoped key.
 */
const treatEveryKeyAsGoalScoped = (): void => {
  vi.spyOn(PermissionRegistry.instance, "scopeOf").mockReturnValue("goal");
};

describe("CapabilitySet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("denies by default", () => {
    expect(CapabilitySet.empty().can("rbac.role.read")).toBe(false);
  });

  it("grants an org-scoped permission under the wildcard", () => {
    const caps = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: [] },
      goals: {},
    });

    expect(caps.can("rbac.role.read")).toBe(true);
  });

  it("denies a goal-scoped permission asked without a goalId", () => {
    treatEveryKeyAsGoalScoped();
    const caps = CapabilitySet.from({
      wildcard: true,
      org: { grants: ["rbac.role.read"], denies: [] },
      goals: { [GOAL]: { grants: ["rbac.role.read"], denies: [] } },
    });

    expect(caps.can("rbac.role.read")).toBe(false);
    expect(caps.can("rbac.role.read", GOAL)).toBe(true);
  });

  it("lets an explicit deny beat the wildcard", () => {
    const caps = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: ["rbac.role.manage"] },
      goals: {},
    });

    expect(caps.can("rbac.role.manage")).toBe(false);
    expect(caps.can("rbac.role.read")).toBe(true);
  });

  it("lets a goal-level deny beat an org-level grant", () => {
    treatEveryKeyAsGoalScoped();
    const caps = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.deactivate"], denies: [] },
      goals: { [GOAL]: { grants: [], denies: ["member.deactivate"] } },
    });

    expect(caps.can("member.deactivate", GOAL)).toBe(false);
    expect(caps.can("member.deactivate", OTHER_GOAL)).toBe(true);
  });

  it("resolves canAll and canAny independently", () => {
    const caps = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read"], denies: [] },
      goals: {},
    });

    expect(caps.canAll(["member.read", "member.invite"])).toBe(false);
    expect(caps.canAny(["member.read", "member.invite"])).toBe(true);
  });

  it("lists only the goals in which a goal-scoped permission holds", () => {
    treatEveryKeyAsGoalScoped();
    const caps = CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {
        [GOAL]: { grants: ["member.read"], denies: [] },
        [OTHER_GOAL]: { grants: [], denies: [] },
      },
    });

    expect(caps.goalsWith("member.read")).toEqual([GOAL]);
  });

  it("round-trips through JSON", () => {
    const caps = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read"], denies: [] },
      goals: { [GOAL]: { grants: [], denies: [] } },
    });
    const revived = CapabilitySet.from(
      JSON.parse(JSON.stringify(caps.toJSON())) as ReturnType<typeof caps.toJSON>,
    );

    expect(revived.can("member.read")).toBe(true);
  });
});

describe("CapabilitySet.intersect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps only what both sides grant", () => {
    const key = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read", "member.invite"], denies: [] },
      goals: {},
    });
    const issuer = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read"], denies: [] },
      goals: {},
    });
    const narrowed = key.intersect(issuer);

    expect(narrowed.can("member.read")).toBe(true);
    expect(narrowed.can("member.invite")).toBe(false);
  });

  it("honours the other side's org deny even when both hold the wildcard", () => {
    const key = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: [] },
      goals: {},
    });
    const issuer = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: ["rbac.role.manage"] },
      goals: {},
    });
    const narrowed = key.intersect(issuer);

    expect(narrowed.can("rbac.role.manage")).toBe(false);
    expect(narrowed.can("rbac.role.read")).toBe(true);
  });

  it("honours a deny inside a goal the narrowed side has never heard of", () => {
    treatEveryKeyAsGoalScoped();
    const key = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: [] },
      goals: {},
    });
    const issuer = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: [] },
      goals: { [GOAL]: { grants: [], denies: ["member.deactivate"] } },
    });
    const narrowed = key.intersect(issuer);

    expect(narrowed.can("member.deactivate", GOAL)).toBe(false);
    expect(narrowed.can("member.deactivate", OTHER_GOAL)).toBe(true);
  });

  it("keeps an org-level grant of a goal-scoped permission", () => {
    treatEveryKeyAsGoalScoped();
    const caps = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read"], denies: [] },
      goals: { [GOAL]: { grants: [], denies: [] } },
    });

    expect(caps.can("member.read", GOAL)).toBe(true);
    expect(caps.intersect(caps).can("member.read", GOAL)).toBe(true);
  });

  it("drops the wildcard but keeps what the weaker side still grants", () => {
    const key = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: [] },
      goals: {},
    });
    const issuer = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read"], denies: [] },
      goals: {},
    });

    // A wildcard key whose issuer has lost superuser narrows to the issuer's
    // explicit grants, not to nothing.
    expect(key.intersect(issuer).can("member.read")).toBe(true);
    expect(key.intersect(issuer).can("member.invite")).toBe(false);
  });

  it("gives the same answers whichever side is narrowed", () => {
    const a = CapabilitySet.from({
      wildcard: true,
      org: { grants: ["member.read"], denies: ["member.invite"] },
      goals: {},
    });
    const b = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read", "member.invite"], denies: [] },
      goals: {},
    });

    for (const p of ["member.read", "member.invite", "apikey.manage"] as const) {
      expect(a.intersect(b).can(p)).toBe(b.intersect(a).can(p));
    }
    expect(a.intersect(b).can("member.read")).toBe(true);
    expect(a.intersect(b).can("member.invite")).toBe(false);
  });
});

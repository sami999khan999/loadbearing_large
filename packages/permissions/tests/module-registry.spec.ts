import { describe, expect, it } from "vitest";
import { CapabilitySet } from "../src/capability-set.js";
import { GATES } from "../src/gate/index.js";
import { ModuleRegistry } from "../src/module-registry.js";
import { PermissionRegistry } from "../src/permission-registry.js";

const registry = ModuleRegistry.instance;

describe("ModuleRegistry", () => {
  it("maps a module key to its gate", () => {
    expect(registry.gate("rbac")).toEqual({
      permission: "rbac.role.read",
      route: "/settings/roles",
    });
  });

  it("hides every module from an empty capability set", () => {
    expect(registry.visibleModules(CapabilitySet.empty())).toEqual([]);
  });

  it("shows only the modules whose gating permission is held", () => {
    const caps = CapabilitySet.from({
      wildcard: false,
      org: { grants: ["member.read"], denies: [] },
      goals: {},
    });

    expect(registry.isVisible("member", caps)).toBe(true);
    expect(registry.isVisible("rbac", caps)).toBe(false);
    expect(registry.visibleModules(caps)).toEqual(["member"]);
  });

  it("hides a module a wildcard holder has been explicitly denied", () => {
    const caps = CapabilitySet.from({
      wildcard: true,
      org: { grants: [], denies: ["rbac.role.read"] },
      goals: {},
    });

    expect(registry.visibleModules(caps)).toEqual(["member"]);
  });

  /**
   * `visibleModules()` asks without a `goalId`, and rule 3 makes a goal-scoped
   * permission `false` in that case — so a module gated on one would be invisible
   * to everyone, forever, with nothing to indicate why. The docs say to gate on
   * org-scoped keys; this is what makes that a checked claim.
   */
  it("gates every module on an org-scoped permission", () => {
    for (const [module, gate] of Object.entries(GATES)) {
      expect(PermissionRegistry.instance.scopeOf(gate.permission), module).toBe("org");
    }
  });
});

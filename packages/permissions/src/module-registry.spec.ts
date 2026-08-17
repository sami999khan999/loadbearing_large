import { describe, expect, it } from "vitest";
import { CapabilitySet } from "./capability-set.js";
import { ModuleRegistry } from "./module-registry.js";

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
});

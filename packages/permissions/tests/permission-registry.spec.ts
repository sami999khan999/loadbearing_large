import { describe, expect, it } from "vitest";
import { PermissionRegistry } from "../src/permission-registry.js";

const registry = PermissionRegistry.instance;

describe("PermissionRegistry", () => {
  it("accepts a key the catalog defines and rejects one it does not", () => {
    expect(registry.isKnown("rbac.role.read")).toBe(true);
    expect(registry.isKnown("rbac.role.delete")).toBe(false);
    expect(registry.isKnown("")).toBe(false);
  });

  it("does not mistake an inherited object property for a permission", () => {
    expect(registry.isKnown("toString")).toBe(false);
    expect(registry.isKnown("constructor")).toBe(false);
  });

  it("lists every key exactly once", () => {
    const all = registry.all();

    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("apikey.manage");
  });

  it("groups keys by module and returns nothing for a module it has never seen", () => {
    expect(registry.modules()).toEqual(["rbac"]);
    expect(registry.byModule("rbac")).toHaveLength(registry.all().length);
    expect(registry.byModule("finance")).toEqual([]);
  });

  it("carries scope on the permission rather than the check", () => {
    expect(registry.scopeOf("rbac.role.read")).toBe("org");
    expect(registry.meta("member.invite").label).toBe("Invite members");
  });
});

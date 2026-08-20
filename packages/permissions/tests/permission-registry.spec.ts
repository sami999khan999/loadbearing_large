import { describe, expect, it } from "vitest";
import { type PermissionKey, PermissionRegistry } from "../src/permission-registry.js";

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
    expect(registry.meta("member.invite")?.label).toBe("Invite members");
  });

  /**
   * `meta` and `scopeOf` are typed to take a `PermissionKey`, so this cannot happen
   * through the type system. It happens at runtime — a cast, or a `CapabilitySetDto`
   * still naming a permission that has since been deleted from the catalog. Blind
   * indexing turned that into a `TypeError` inside `can()`, and a 403 into a 500.
   */
  it("returns undefined rather than throwing for a key it does not define", () => {
    const gone = "task.archive" as PermissionKey;

    expect(registry.meta(gone)).toBeUndefined();
    expect(registry.scopeOf(gone)).toBeUndefined();
  });

  it("returns the same array instance across calls", () => {
    expect(registry.all()).toBe(registry.all());
    expect(registry.modules()).toBe(registry.modules());
    expect(registry.byModule("rbac")).toBe(registry.byModule("rbac"));
  });
});

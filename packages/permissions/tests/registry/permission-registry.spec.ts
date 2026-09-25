import { describe, expect, it } from "vitest";
import { type PermissionKey, PermissionRegistry } from "../../src/registry/permission-registry.js";

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
    // Insertion order of the fragments merged in `catalog/index.ts`.
    expect(registry.modules()).toEqual([
      "core",
      "rbac",
      "member",
      "messaging",
      "notification",
      "apikey",
      "ai",
      "analytics",
      "platform",
    ]);

    const grouped = registry.modules().flatMap((module) => registry.byModule(module));
    expect(grouped).toHaveLength(registry.all().length);

    expect(registry.byModule("finance")).toEqual([]);
  });

  // The regression guard: `member.*` and `apikey.*` declared `module: "rbac"`, so
  // `byModule("member")` answered nothing about a module that has a gate.
  it("declares the module its key opens with", () => {
    for (const key of registry.all()) {
      expect(key.startsWith(`${registry.meta(key)?.module}.`)).toBe(true);
    }
  });

  it("carries scope on the permission rather than the check", () => {
    expect(registry.scopeOf("rbac.role.read")).toBe("org");
    expect(registry.meta("member.invite")?.label).toBe("Invite members");
  });

  // Reachable only at runtime — a cast, or a cached DTO naming a deleted permission.
  // Blind indexing turned that into a `TypeError` inside `can()`, and a 403 into a 500.
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

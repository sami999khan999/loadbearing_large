# 08 · `@loadbearing/permissions`

> The shared kernel, half one. The permission registry, the module registry, and the capability resolver every runtime consults.

**Delivers:** `PermissionRegistry`, `ModuleRegistry`, `CapabilitySet` — deny-by-default resolution running identically on server, client, worker, and desktop.

**Prerequisite:** [07 · `@loadbearing/core`](07-core-package.md)

---

## Why this is one artifact

The strongest claim the architecture makes is that there is no hardcoded role check anywhere and no second security model to keep in sync. That only survives contact with reality if the permission vocabulary, the resolution algorithm, and the scope rules are **one artifact** shared by every runtime — the oRPC handler, React route guards, the `<Can>` component, the worker, and eventually the Tauri desktop app.

So this package has no database, no HTTP, no React, and no Node built-ins. It is pure data plus one resolution algorithm, and it loads anywhere.

```
packages/permissions/
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── permission-registry.ts   → PermissionRegistry, PermissionKey, PermissionMeta, PermissionScope
    ├── permission-registry.spec.ts
    ├── module-registry.ts       → ModuleRegistry, ModuleKey, ModuleGate
    ├── module-registry.spec.ts
    ├── capability-set.ts        → CapabilitySet, CapabilitySetDto, ScopedSetDto
    ├── capability-set.spec.ts
    ├── catalog/                 ← one fragment per slice, team-owned
    │   ├── index.ts             ←   merges fragments (platform-owned)
    │   └── rbac.permissions.ts
    └── gate/                    ← same pattern for nav gates
        ├── index.ts
        └── rbac.gate.ts
```

---

## Step 8.1 — Fragment the catalog from day one

One `CATALOG` object works until three teams edit it in the same sprint and every pull request conflicts. Split it by module and merge in a barrel. The literal-union type survives the spread, so typo-safety is unaffected.

**`packages/permissions/src/catalog/rbac.permissions.ts`** — the only fragment the starter kit ships:

```ts
import type { PermissionMeta } from "../permission-registry.js";

export const rbacPermissions = {
  "rbac.role.read": { scope: "org", module: "rbac", label: "View roles" },
  "rbac.role.manage": { scope: "org", module: "rbac", label: "Create and edit roles" },
  "rbac.permission.grant": { scope: "org", module: "rbac", label: "Grant permissions" },
  "rbac.permission.revoke": { scope: "org", module: "rbac", label: "Revoke permissions" },
  "rbac.effective.inspect": {
    scope: "org",
    module: "rbac",
    label: "Inspect effective permissions",
  },
  "member.read": { scope: "org", module: "rbac", label: "View members" },
  "member.invite": { scope: "org", module: "rbac", label: "Invite members" },
  "member.deactivate": { scope: "org", module: "rbac", label: "Deactivate members" },
  "apikey.read": { scope: "org", module: "rbac", label: "View API keys" },
  "apikey.manage": { scope: "org", module: "rbac", label: "Create and revoke API keys" },
} as const satisfies Record<string, PermissionMeta>;
```

**`packages/permissions/src/catalog/index.ts`** — platform-owned, changes only when a module is added:

```ts
import { rbacPermissions } from "./rbac.permissions.js";

export const CATALOG = {
  ...rbacPermissions,
  // ...taskPermissions,
  // ...financePermissions,
} as const;
```

Each team owns one file. Two teams adding permissions in the same week touch different files and never conflict.

### The key format

```
<module>.<subject>.<action>[.<qualifier>]
```

Lowercase, dot-separated, no plurals. `task.reactivate`, `finance.invoice.approve`, `task.update.self`. The `.self` qualifier is the convention for "the same action, but only on rows you own" — the entity decides what "own" means, so `task.update` and `task.update.self` are two keys, not one key with a flag.

**A permission key is never deleted, only stopped being granted.** Deleting a key means `PermissionRegistry.isKnown()` starts rejecting rows that already exist in `role_permissions`, which is correct behaviour and a confusing way to discover the change. Remove the grants first, in a migration, then remove the key in a later release.

---

## Step 8.2 — `PermissionRegistry`

**`packages/permissions/src/permission-registry.ts`**

```ts
import { CATALOG } from "./catalog/index.js";

export type PermissionScope = "org" | "goal";

export interface PermissionMeta {
  readonly scope: PermissionScope;
  readonly module: string;
  readonly label: string;
}

export type PermissionKey = keyof typeof CATALOG;

export class PermissionRegistry {
  public static readonly instance = new PermissionRegistry();

  private constructor() {}

  public all(): readonly PermissionKey[] {
    return Object.keys(CATALOG) as PermissionKey[];
  }

  public meta(key: PermissionKey): PermissionMeta {
    return CATALOG[key];
  }

  public scopeOf(key: PermissionKey): PermissionScope {
    return CATALOG[key].scope;
  }

  public byModule(module: string): readonly PermissionKey[] {
    return this.all().filter((k) => CATALOG[k].module === module);
  }

  /**
   * Permission strings from the database must pass this before they are trusted.
   *
   * `Object.hasOwn`, not `value in CATALOG`: `in` walks the prototype chain, so a
   * stored row reading `constructor` or `toString` would pass and then resolve to
   * a `PermissionMeta` of `undefined`, whose `scope` check falls through to the
   * org branch and grants a permission that does not exist.
   */
  public isKnown(value: string): value is PermissionKey {
    return Object.hasOwn(CATALOG, value);
  }

  public modules(): readonly string[] {
    return [...new Set(this.all().map((k) => CATALOG[k].module))];
  }
}
```

**`isKnown()` earns its place immediately.** Role grants, per-user overrides, and API-key scopes all arrive from the database as raw strings. A stale row must never grant something the registry no longer defines. Every one of those paths filters through `isKnown()` before the string becomes a `PermissionKey` — that type predicate is the boundary between untrusted text and the typed vocabulary.

> [!CAUTION]
> **`value in CATALOG` does not hold that boundary** — verified by a failing test. `CATALOG` is an object literal, so it inherits from `Object.prototype` and `"constructor" in CATALOG` is `true`. A `role_permissions` row reading `constructor` then passes `isKnown()`, narrows to `PermissionKey`, and lands in a grant set; `scopeOf` reads `undefined`, `undefined === "goal"` is false, the org branch finds the string in the grants set, and `can()` returns **`true`** for a permission that does not exist. `Object.hasOwn` checks own properties only. `all()`, `byModule()`, and `modules()` were never affected — they go through `Object.keys`.

**`PermissionRegistry.instance` is `static readonly`**, which satisfies the static-mutable-state ban in [05](05-lint-and-format.md). It holds no state; the singleton exists so call sites read `PermissionRegistry.instance.isKnown(x)` rather than constructing one each time.

**Scope is a property of the permission, not of the check.** `goal.create` is org-scoped because you create a goal before it exists; `goal.update` is goal-scoped because it operates on one. Getting this wrong is the most common modelling error here, and the symptom is `can()` returning `false` for someone who should obviously have access — because a goal-scoped permission was asked without a `goalId`.

---

## Step 8.3 — `ModuleRegistry`

The permission catalog answers "may this actor do X." The module registry answers "should this actor see the finance section at all," which is a different question with a different owner.

**`packages/permissions/src/gate/rbac.gate.ts`**

```ts
import type { ModuleGate } from "../module-registry.js";

export const rbacGates = {
  rbac: { permission: "rbac.role.read", route: "/settings/roles" },
  member: { permission: "member.read", route: "/settings/members" },
} as const satisfies Record<string, ModuleGate>;
```

**`packages/permissions/src/gate/index.ts`** — platform-owned, mirrors the catalog barrel:

```ts
import { rbacGates } from "./rbac.gate.js";

export const GATES = {
  ...rbacGates,
  // ...taskGates,
  // ...financeGates,
} as const;
```

**`packages/permissions/src/module-registry.ts`**

```ts
import type { CapabilitySet } from "./capability-set.js";
import { GATES } from "./gate/index.js";
import type { PermissionKey } from "./permission-registry.js";

export interface ModuleGate {
  readonly permission: PermissionKey;
  readonly route: string;
}

export type ModuleKey = keyof typeof GATES;

export class ModuleRegistry {
  public static readonly instance = new ModuleRegistry();

  private constructor() {}

  public gate(module: ModuleKey): ModuleGate {
    return GATES[module];
  }

  public isVisible(module: ModuleKey, caps: CapabilitySet): boolean {
    return caps.can(GATES[module].permission);
  }

  public visibleModules(caps: CapabilitySet): readonly ModuleKey[] {
    return (Object.keys(GATES) as ModuleKey[]).filter((m) => this.isVisible(m, caps));
  }
}
```

**Why this is a separate registry.** `@loadbearing/content` owns the navigation menu — its labels, order, and icons — and a content editor may change all three. What an editor must *not* be able to change is which permission gates a module or where its route points. So `nav.data.ts` in `content` carries `module: "finance"`, never `permission: "finance.read.global"`, and `ModuleRegistry` maps that key to its gate. `content` may import `ModuleKey` as a type and must never reference `PermissionKey` at all — a rule the root ESLint config enforces explicitly for that package ([19](19-content-package.md)).

---

## Step 8.4 — `CapabilitySet`

**`packages/permissions/src/capability-set.ts`**

```ts
import { type PermissionKey, PermissionRegistry } from "./permission-registry.js";

export interface ScopedSetDto {
  readonly grants: readonly PermissionKey[];
  readonly denies: readonly PermissionKey[];
}

export interface CapabilitySetDto {
  readonly wildcard: boolean;
  readonly org: ScopedSetDto;
  readonly goals: Readonly<Record<string, ScopedSetDto>>;
}

class ScopedSet {
  private readonly grants: ReadonlySet<PermissionKey>;
  private readonly denies: ReadonlySet<PermissionKey>;

  public constructor(dto: ScopedSetDto) {
    this.grants = new Set(dto.grants);
    this.denies = new Set(dto.denies);
  }

  public grantsPermission(p: PermissionKey): boolean {
    return this.grants.has(p);
  }

  public deniesPermission(p: PermissionKey): boolean {
    return this.denies.has(p);
  }
}

/** Resolved capabilities for one principal — user or API key, same shape. */
export class CapabilitySet {
  private readonly orgSet: ScopedSet;
  private readonly goalSets: ReadonlyMap<string, ScopedSet>;

  private constructor(private readonly dto: CapabilitySetDto) {
    this.orgSet = new ScopedSet(dto.org);
    this.goalSets = new Map(
      Object.entries(dto.goals).map(([id, s]): [string, ScopedSet] => [id, new ScopedSet(s)]),
    );
  }

  public static from(dto: CapabilitySetDto): CapabilitySet {
    return new CapabilitySet(dto);
  }

  public static empty(): CapabilitySet {
    return new CapabilitySet({ wildcard: false, org: { grants: [], denies: [] }, goals: {} });
  }

  private static union(a: readonly PermissionKey[], b: readonly PermissionKey[]): PermissionKey[] {
    return [...new Set([...a, ...b])];
  }

  /** Deny by default. An explicit deny beats every grant, including the wildcard. */
  public can(permission: PermissionKey, goalId?: string): boolean {
    if (PermissionRegistry.instance.scopeOf(permission) === "goal") {
      if (!goalId) return false;
      const goal = this.goalSets.get(goalId);
      if (goal?.deniesPermission(permission)) return false;
      if (this.orgSet.deniesPermission(permission)) return false;
      if (this.dto.wildcard) return true;
      return (
        (goal?.grantsPermission(permission) ?? false) || this.orgSet.grantsPermission(permission)
      );
    }

    return this.allowsAtOrg(permission);
  }

  public canAll(permissions: readonly PermissionKey[], goalId?: string): boolean {
    return permissions.every((p) => this.can(p, goalId));
  }

  public canAny(permissions: readonly PermissionKey[], goalId?: string): boolean {
    return permissions.some((p) => this.can(p, goalId));
  }

  /** Goals in which this principal holds a given goal-scoped permission. */
  public goalsWith(permission: PermissionKey): readonly string[] {
    return [...this.goalSets.keys()].filter((id) => this.can(permission, id));
  }

  /**
   * Narrow this set to the intersection with another. Used when an API key's
   * scopes are re-intersected with its issuer's live capabilities at resolution.
   *
   * Denies union, grants intersect, goal keys union, and both sides' grants are
   * candidates. See the four notes below — each one is a way this method leaked
   * or over-narrowed before.
   */
  public intersect(other: CapabilitySet): CapabilitySet {
    const goalIds = new Set([...Object.keys(this.dto.goals), ...Object.keys(other.dto.goals)]);
    const orgCandidates = CapabilitySet.union(this.dto.org.grants, other.dto.org.grants);

    return CapabilitySet.from({
      wildcard: this.dto.wildcard && other.dto.wildcard,
      org: {
        grants: orgCandidates.filter((p) => this.allowsAtOrg(p) && other.allowsAtOrg(p)),
        denies: CapabilitySet.union(this.dto.org.denies, other.dto.org.denies),
      },
      goals: Object.fromEntries(
        [...goalIds].map((goalId): [string, ScopedSetDto] => {
          const mine = this.dto.goals[goalId];
          const theirs = other.dto.goals[goalId];

          return [
            goalId,
            {
              grants: CapabilitySet.union(mine?.grants ?? [], theirs?.grants ?? []).filter(
                (p) => this.can(p, goalId) && other.can(p, goalId),
              ),
              denies: CapabilitySet.union(mine?.denies ?? [], theirs?.denies ?? []),
            },
          ];
        }),
      ),
    });
  }

  public toJSON(): CapabilitySetDto {
    return this.dto;
  }

  /** `can()` for an org-scoped permission — and the org half of a goal-scoped one. */
  private allowsAtOrg(permission: PermissionKey): boolean {
    if (this.orgSet.deniesPermission(permission)) return false;
    if (this.dto.wildcard) return true;
    return this.orgSet.grantsPermission(permission);
  }
}
```

### The four resolution rules

1. **Deny by default.** Absence of a grant is a denial. There is no "allow unless denied" path.
2. **Explicit deny beats every grant**, including the wildcard. This is what makes per-user overrides usable as a suspension mechanism without unpicking role assignments.
3. **A goal-scoped permission with no `goalId` is `false`.** Not an error, not a throw — `false`. This makes forgetting the scope fail closed.
4. **Wildcard is checked after denies.** A superuser who has been explicitly denied one permission is denied it.

### `goalsWith()` does more work than it looks

Escalation that resolves targets *by permission rather than by role* is this method. "A manager sees capacity only within their own goals" is this method. Per-recipient digest filtering is this method. Writing it once, on the class that owns the data, is what makes "no hardcoded role checks" true rather than aspirational — the alternative is a `WHERE role = 'manager'` in three different query files that drift apart.

### `intersect()` and the API-key model

An API key is a principal whose capability set cannot exceed its issuer's. Intersecting at creation is the obvious half. Re-intersecting **at resolution** is the half that matters: when the issuer's permission is revoked, every key they created narrows on the next request rather than at the next key rotation. That closes the most common way an RBAC model gets quietly defeated. See [15](15-auth-package.md).

Which makes this the one method in the package that is a security boundary rather than a convenience, and it has to be correct in four ways the obvious implementation is not. All four are proven by tests in `capability-set.spec.ts` — write the naive body and exactly those tests go red.

| Rule | Naive version | What breaks |
| --- | --- | --- |
| **Denies union** | keeps only `this.dto.org.denies` | two wildcard sets produce one that grants what the other explicitly refused — a privilege escalation, not a rounding error |
| **Goal keys union** | iterates `Object.entries(this.dto.goals)` | a deny inside a goal `this` has never heard of is discarded entirely |
| **Org candidates via `allowsAtOrg`** | filters org grants through `other.can(p)` | rule 3 makes that `false` for every goal-scoped key, so an org-level grant of one is dropped and `intersect` is not even idempotent |
| **Both sides' grants are candidates** | filters only `this.dto.org.grants` | a wildcard set lists nothing, so it intersects down to nothing — an issuer who has lost superuser leaves their keys dead instead of narrowed |

The last one is the realistic case rather than a contrived one: an issuer who *was* a superuser created a wildcard key and has since lost superuser. The key must narrow to the issuer's current explicit grants — not to nothing, and certainly not stay wildcard. Taking the union of both sides' grants as the candidate set and keeping each key only where both sides allow it makes this a real set intersection, and makes it answer the same whichever side is narrowed.

### `toJSON()` / `from()` is why one class serves four runtimes

The DTO is plain JSON. The server resolves a `CapabilitySet` from the database, serialises it into the SSR payload, and the browser reconstructs the identical class. The `<Can>` component and the oRPC handler then run the *same* `can()` — not two implementations that agree today. The worker and the desktop app do the same. That identity is the entire point of the package.

---

## Step 8.5 — Tests

The package needs its own runner config first — without it vitest's default `include` also walks `dist/`:

**`packages/permissions/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.spec.ts"] },
});
```

**`packages/permissions/src/capability-set.spec.ts`** — the shape; the shipped file carries fourteen cases, including one per `intersect` rule above.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilitySet } from "./capability-set.js";
import { PermissionRegistry } from "./permission-registry.js";

const GOAL = "018f8c00-0000-7000-8000-000000000001";

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
```

The round-trip test is the one that protects the architecture. If it ever fails, the server and the browser have stopped agreeing about permissions.

Two details in that listing are not stylistic:

- **The cast on `JSON.parse` is required.** It returns `any`, and `@typescript-eslint/no-unsafe-argument` — on via `recommendedTypeChecked` in [05](05-lint-and-format.md) — rejects passing it straight into `from()`.
- **`treatEveryKeyAsGoalScoped` exists because rule 3 is otherwise untestable.** Every key in the shipped catalog is org-scoped, so the original listing's "denies a goal-scoped permission asked without a goalId" asserted `can("rbac.role.read") === true` on an org-scoped key — it tested the opposite of its name and left the fail-closed branch unverified. Stubbing the one method `can()` consults reaches the real branch without inventing catalog keys that belong to [12](12-db-package.md).

`permission-registry.spec.ts` and `module-registry.spec.ts` are worth the same treatment — `isKnown()` is a security boundary and `visibleModules()` is what the whole navigation renders from. Twenty-three tests total.

---

## Step 8.6 — The barrel

**`packages/permissions/src/index.ts`**

```ts
export * from "./capability-set.js";
export * from "./catalog/index.js";
export * from "./gate/index.js";
export * from "./module-registry.js";
export * from "./permission-registry.js";
```

---

## ✅ Gate

- A misspelled `PermissionKey` is a **compile error**, not a runtime `false`. Verified — `caps.can("rbac.role.reed")` gives `TS2820: Did you mean '"rbac.role.read"'?`, and `ModuleRegistry.instance.gate("finance")` gives `TS2345: not assignable to parameter of type '"rbac" | "member"'`. The literal unions survive both barrels' spreads.
- `CapabilitySet.from(caps.toJSON())` round-trips.
- `pnpm --filter @loadbearing/permissions typecheck` is clean and `test` passes — 23 tests.
- `pnpm exec biome check packages/permissions` and `pnpm exec eslint packages/permissions/src` are both clean. There is no per-package `lint` script; that gate is root-only.
- `pnpm --filter @loadbearing/permissions build` emits `dist/index.d.ts` exporting all of `CATALOG`, `CapabilitySet`, `CapabilitySetDto`, `GATES`, `ModuleGate`, `ModuleKey`, `ModuleRegistry`, `PermissionKey`, `PermissionMeta`, `PermissionRegistry`, `PermissionScope`, `ScopedSetDto`.

Do not proceed until this passes.

---

[← `@loadbearing/core`](07-core-package.md) · [`@loadbearing/contracts` →](09-contracts-package.md)

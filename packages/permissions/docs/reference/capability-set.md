---
title: capability-set
description: CapabilitySet — deny-by-default permission resolution, the four rules, and why intersect() is the method an RBAC model gets quietly defeated through.
---

# `CapabilitySet`

Resolved capabilities for one principal — a user or an API key, same shape.

```ts
export class CapabilitySet {
  public static from(dto: CapabilitySetDto): CapabilitySet;
  public static empty(): CapabilitySet;

  public can(permission: PermissionKey, goalId?: string): boolean;
  public canAll(permissions: readonly PermissionKey[], goalId?: string): boolean;
  public canAny(permissions: readonly PermissionKey[], goalId?: string): boolean;
  public goalsWith(permission: PermissionKey): readonly string[];
  public intersect(other: CapabilitySet): CapabilitySet;
  public toJSON(): CapabilitySetDto;
}
```

---

## The four resolution rules

1. **Deny by default.** Absence of a grant is a denial. There is no "allow unless denied" path.
2. **Explicit deny beats every grant**, including the wildcard. This is what makes a per-user
   override usable as a suspension mechanism without unpicking role assignments.
3. **A goal-scoped permission with no `goalId` is `false`.** Not an error, not a throw — `false`.
   Forgetting the scope fails closed.
4. **Wildcard is checked after denies.** A superuser explicitly denied one permission is denied it.

```ts
CapabilitySet.empty().can("rbac.role.read");   // false — rule 1

const caps = CapabilitySet.from({
  wildcard: true,
  org: { grants: [], denies: ["rbac.role.manage"] },
  goals: {},
});
caps.can("rbac.role.manage");                  // false — rules 2 and 4
caps.can("rbac.role.read");                    // true
```

A goal-level deny is checked before the org-level grant that would otherwise cover it, so a
principal can hold a permission org-wide and be denied it in exactly one goal.

---

## `toJSON()` / `from()` is why one class serves four runtimes

The DTO is plain JSON. The server resolves a set from the database, serialises it into the SSR
payload, and the browser reconstructs the identical class. The `<Can>` component and the oRPC
handler then run the *same* `can()` — not two implementations that agree today. The worker and the
desktop app do the same.

```ts
const revived = CapabilitySet.from(JSON.parse(payload) as CapabilitySetDto);
```

> [!IMPORTANT]
> The round-trip test in `capability-set.spec.ts` is the one that protects the architecture. If it
> ever fails, the server and the browser have stopped agreeing about permissions.

The `as CapabilitySetDto` is required, not decorative: `JSON.parse` returns `any`, and
`@typescript-eslint/no-unsafe-argument` — on via `recommendedTypeChecked` — rejects passing it
straight into `from()`.

---

## `goalsWith()` does more work than it looks

```ts
caps.goalsWith("task.update"); // readonly string[]
```

Escalation that resolves targets *by permission rather than by role* is this method. "A manager sees
capacity only within their own goals" is this method. Per-recipient digest filtering is this method.
Writing it once, on the class that owns the data, is what makes "no hardcoded role checks" true
rather than aspirational — the alternative is `WHERE role = 'manager'` in three query files that
drift apart.

It answers for goal-scoped keys. Asked with an org-scoped key it returns every goal in the set,
because the org grant covers all of them; that is consistent, not useful.

---

## `intersect()` is a security boundary

An API key is a principal whose capability set cannot exceed its issuer's. Intersecting at creation
is the obvious half. Re-intersecting **at resolution** is the half that matters: when the issuer's
permission is revoked, every key they created narrows on the *next request* rather than at the next
key rotation. That closes the most common way an RBAC model gets quietly defeated.

Which means the method has to be correct in four ways the original listing was not. All four are
proven by tests in `capability-set.spec.ts` — restore the original body and exactly those tests go
red.

### Denies union, grants intersect

```ts
// key: wildcard, no denies.  issuer: wildcard, denies rbac.role.manage.
key.intersect(issuer).can("rbac.role.manage");
// original: true  ← the key does what its issuer is explicitly refused
// correct:  false
```

Keeping only `this`'s denies means `wildcard && wildcard` survives with an empty deny list, and the
intersection grants strictly more than one of its inputs. A deny on either side has to survive.

### Goal keys union

```ts
// key knows no goals.  issuer denies member.deactivate inside GOAL.
key.intersect(issuer).can("member.deactivate", GOAL);
// original: true  ← iterating this.dto.goals discards the goal entirely
// correct:  false
```

Iterating only `this`'s goals silently drops every restriction the other side expressed about a goal
`this` has never heard of.

### Org candidates are tested at org level

```ts
// member.read granted at org level, treated as goal-scoped.
caps.intersect(caps).can("member.read", GOAL);
// original: false  ← intersect is not even idempotent
// correct:  true
```

An org-level grant of a *goal*-scoped permission is real — it covers every goal. But `can(p)` with
no `goalId` is `false` by rule 3, so filtering org grants through `can()` drops it. `intersect` uses
a private `allowsAtOrg()` instead, which is also the org branch `can()` itself delegates to.

### Both sides' grants are candidates

```ts
// key: wildcard, lists nothing.  issuer: no wildcard, grants member.read.
key.intersect(issuer).can("member.read");
// original: false  ← the intersection is empty
// correct:  true
```

A wildcard set grants everything and lists nothing, so filtering only `this`'s grants intersects it
down to nothing. This is the realistic case, not a contrived one: an issuer who *was* a superuser
created a wildcard key and has since lost superuser. The key must narrow to the issuer's current
explicit grants — not to nothing, and certainly not stay wildcard.

Taking the union of both sides' grants as the candidate set and keeping each key only where both
sides allow it makes the operation a real set intersection, and makes it behave the same whichever
side is narrowed.

---

## `ScopedSet` is internal on purpose

`grants` and `denies` are `ReadonlySet`s built once in the constructor, so `can()` is two hash
lookups rather than two array scans. The class is not exported — the DTO is the contract, and
`ScopedSet` is free to change shape.

Note `public constructor(dto: ScopedSetDto)`: Biome's `useConsistentMemberAccessibility` is set to
`explicit`, so a bare `constructor(` is a lint error throughout this codebase.

---

## See also

- [`@loadbearing/permissions`](../index.md)
- [PermissionRegistry](permission-registry.md) — where `scopeOf()` comes from
- [ModuleRegistry](module-registry.md) — the only other consumer of `can()` inside this package
- [15 · auth](../../../../docs/setup/15-auth-package.md) — the API-key resolution path that calls `intersect()`

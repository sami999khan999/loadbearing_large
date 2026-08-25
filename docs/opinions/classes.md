---
title: Classes and methods
description: Plain role nouns for seams, technology prefixes for implementations, and a closed method vocabulary.
---

# Classes and methods

## Class names

| Kind | Convention | Example |
|---|---|---|
| Abstract seam | Plain role noun — **no `I`, no `Abstract`** | `VectorStore`, `AuthStrategy`, `Clock` |
| Concrete implementation | **Technology prefix** + the seam name | `PgVectorStore`, `S3StorageGateway`, `SystemClock` |
| Test double | `Fake` or `Fixed` prefix | `FakeTaskRepository`, `FixedClock` |
| Use-case | `<Verb><Noun>UseCase` | `ReactivateTaskUseCase` |
| Repository | `<Aggregate>Repository` | `TaskRepository` |
| Entity | `<Noun>Entity` | `TaskEntity` |
| Contract | `<Noun>Contract` | `TaskContract` |
| Error | `<Reason>Error` | `ForbiddenError` |
| Registry | `<Noun>Registry` | `PermissionRegistry` |

The technology-prefix rule is what makes a seam visible at a glance. Seeing `PgVectorStore` in the
`Container` and `VectorStore` everywhere else tells you exactly where the Qdrant swap happens
([14](../setup/14-vector-store.md)).

**Banned suffixes:** `Manager`, `Helper`, `Util`, `Handler`, and bare `Service`. They describe
nothing. If a class fits none of `UseCase`, `Repository`, `Gateway`, `Store`, `Reader`, `Logger`,
`Provider`, `Publisher`, `Resolver`, `Bus`, `Policy`, `Strategy`, `Entity`, `Registry`, it probably
wants splitting. `Policy` is the escape valve for a domain rule too broad for one entity.

The list is longer than it looks because it is descriptive: every suffix on it names a port that
exists. A `Reader` reads and never writes — `AnalyticsReader` is the whole reason that distinction is
worth a word, because a write method on it would silently make a derived store authoritative
([Data and scale](data-and-scale.md) §2). Adding a suffix means adding a row here and a row in
[Files](files.md), which is the friction that keeps `Manager` out.

## Methods

| Pattern | Rule | Example |
|---|---|---|
| Use-case entry | Always `execute` | `execute(principal, input)` |
| Repository read, nullable | `findBy<X>` | `findById` |
| Repository read, throwing | `findBy<X>OrFail` | `findByIdOrFail` |
| Repository write | `save`, `delete` — never `update`/`insert` | `save(entity)` |
| Existence | `exists<X>` | `existsByEmail` |
| Mapping | `toDto` / `fromDto` / `toEntity` | `TaskEntity.fromDto(dto)` |
| Factory | `static from<X>` or `static create` | `CapabilitySet.from(dto)` |
| Boolean | `is` / `has` / `can` / `should` prefix | `isLockedFromAssignee()` |
| Assertion (throws) | `assert<X>` | `authorizer.assert(...)` |
| Predicate (returns) | `can<X>` | `capabilities.can(...)` |
| Aggregate read | the metric, pluralised | `goalRiskScores(goalIds)` |

**An aggregate read is the one row with no verb prefix, and that is deliberate.** `findBy<X>` returns
entities; these return numbers over a window, so `findByGoalRiskScore` would be a lie about what
comes back. Name the metric and let the plural carry the "many" — and keep the permitted scope in
the signature, because an analytics store cannot resolve a `CapabilitySet` for you.

**The `assert` vs `can` split is worth internalising.** `can()` answers a question; `assert()`
enforces an outcome. Mixing them produces the exact bug this architecture exists to prevent — a UI
check silently becoming the only check.

## Accessibility is explicit, always

`public`, `private`, or `protected` on every member. Enforced by Biome's
`style/useConsistentMemberAccessibility` with `accessibility: "explicit"`. An unmarked member is
public by accident rather than by decision, which is the same failure `export *` causes one level
up.

## No exported free functions in the OOP packages

`core`, `permissions`, `errors`, `contracts`, `application`, `db`, `infrastructure`, `auth`,
`composition`, `api-client`, `asset`, `content` export classes. A namespace of static methods on a
class with a private constructor is the shape — `Locales`, `Results`, `ErrorNormalizer`. Enforced by
ESLint `no-restricted-syntax`; Biome's `complexity/noStaticOnlyClass` is switched off precisely to
allow it.

`ui`, `query`, and `feature` are exempt: React components and hooks are functions.

## No static mutable state

`static readonly` holding a `Map` is mutable state wearing a `readonly` keyword — the reference is
frozen, the contents are not. Derived lookups are built once at module load and frozen instead:

```ts
// packages/permissions/src/registry/permission-registry.ts
const ALL_KEYS: readonly PermissionKey[] = Object.freeze(Object.keys(CATALOG) as PermissionKey[]);
```

Enforced by ESLint `no-restricted-syntax`.

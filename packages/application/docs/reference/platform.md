---
title: The platform slice
description: What a use-case above the tenant may assume, why its health seam is a slice port rather than a cross-cutting one, and the audit rebase that keeps a global change out of a customer's trail.
---

# `application/src/platform/`

Every other slice in this package acts inside one tenant. This one acts above every tenant, and
three things follow from that.

## The actor is ordinary; the key is not

A platform use-case takes the same `Principal` every other use-case takes. Nothing about it is
special — it carries whichever organization the session is pointed at, which for a platform admin
is usually a customer tenant they switched into.

What makes it platform work is the key:

```ts
this.authorizer.assert(actor, "platform.status.read");
```

`platform.*` is `scope: "platform"`, so `CapabilitySet.can()` takes the branch that consults the
platform axis and nothing else. A tenant owner's `wildcard` does not reach it. The four leak paths
and what closes each are in
[`permissions/docs/reference/platform-scope.md`](../../../permissions/docs/reference/platform-scope.md).

## The audit row is rebased, and it is a rule rather than a field

A platform admin's active tenant is whichever they switched to. An audit row under it would say a
customer changed a global setting — and a support engineer reading that tenant's trail would be
looking at a change nobody in that tenant made.

So a platform use-case records its audit row against the **tier**:

```ts
await this.activity.record(
  new Principal(await this.platform.organizationId(), actor.userId, actor.capabilities, actor.kind),
  "platform.policy.changed",
  { … },
);
```

That is decision D38, and it is deliberately not a field on `Principal`: authorization has already
happened against the real principal, and this is the audit call's actor alone. A `rebasedFor`
field would be one more thing every other use-case has to ignore correctly.

Phase 18 ships no writing platform use-case, so nothing runs this yet. The first one is
`update-retention-policy`, and this page is where its shape is stated before it is written.

## `PlatformReader` — which organization is the tier

```ts
abstract class PlatformReader {
  abstract organizationId(): Promise<OrganizationId>;
  abstract organization(): Promise<PlatformOrganization>;
}
```

Two methods because they have different callers and different costs. `organizationId` is read on
**every RBAC write** — `CapabilityCache` asks it to decide whether flushing a tenant should also
flush the platform axis — so it returns the one value that question needs. `organization` is the
screen's, and carries the slug and name beside it.

Both throw rather than returning null. `organizations_platform_uq` guarantees at most one and
`pnpm db:seed` guarantees at least one, so a miss is a database nobody seeded: a broken deployment,
not a case every caller has to branch on.

## `PlatformHealthReader` — a slice port, not a cross-cutting one

The status page reports what `Container.health()` already answers. `Container` lives in
`composition`, which sits to the **right** of this package, so a use-case cannot name it. The seam
is forced by the layering rather than by an expected second implementation, which is the one
exception `simplicity.md` allows.

It is in the slice rather than in `application/src/port/` for the reason
[`folders.md`](../../../../docs/ai/rules/folders.md) gives: `port/` is for cross-cutting seams, and
the test is whether a second feature adds a *method* to it or a *file beside it*. Phases 19 and 20
add `RetentionPolicyRepository`, `ProjectionPolicyRepository` and `PlatformPolicyRepository` —
files beside it, every one.

`PlatformHealth` narrows `HealthReport`: it drops `pool`, because a screen showing a pool gauge
would be showing one process's, which is not the deployment's.

## `TenantStorageReader` — a slice port, and why cold only

Beside `PlatformHealthReader`, and a slice port for the same reason: one caller, one screen, and
a second feature would add a file beside it rather than a method to it.

`byTenant(page, organizationId)` takes the tenant as an argument rather than filtering a page
already cut to a limit — the difference is a page of twenty-five that returns three rows.
`monthsFor` is unpaginated because months × retired tables is bounded by the retention policy,
but it runs **only** when a tenant is named: across every tenant at once it is not bounded, and
the league table does not need it.

The tenant comes off the input here, not off the principal. Every other list in this repository
reads `actor.organizationId`; a platform admin is signed into the tier and asking about somebody
else's tenant, which is what the `platform` scope is for.

## What lands here next

| Phase | Files |
|---|---|
| 19 | `retention-policy.repository.ts`, `retention.rules.ts`, `list-retention-policies`, `update-retention-policy`, `preview-retention-change`, `restore-partition`, `list-tenant-storage`, `tenant-retention-policy.repository.ts`, `update-tenant-retention`, `delete-organization`, `export-organization` |
| 20 | `projection-policy.repository.ts`, `platform-policy.repository.ts`, `list-projection-policies`, `update-projection-policy`, `toggle-projection`, `reproject-partition` |
| 22 · 24 | `inspect-shard-map`, `move-tenant` |

Every one asserts a `platform.*` key, and every write rebases its audit row.

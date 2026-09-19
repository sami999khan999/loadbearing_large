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

## `DeleteOrganizationUseCase` — the order is the behaviour

Archive every month, drop the seven tenant partitions, delete the row, then flush. Each step is
where it is because of what the step before it makes impossible.

The archive cutoff is the first of **next** month, not now. Every other caller of
`partitionsBefore` is asking "what has aged out"; this one is asking "what exists", because the
partitions are about to be dropped and a month left unarchived is rows nothing can hand back.

`dropTenantPartitions` runs **outside** the transaction and before it. Dropping a partition is a
catalog edit, and a transaction holding seven of them blocks every other DDL in the system for as
long as it is open.

The cache flush and the analytics delete run **after** the commit. Flushed before it, the cache
would refill from rows the transaction had not removed yet — which is the stale entry the flush
exists to prevent.

Two refusals, and the first is not a formality: the tier holds the platform roles every admin's
capability comes from, this one included, so deleting it locks the deployment out of its own
platform screens. The second is the typed slug, compared here as well as in the browser — a
confirmation only the client checks is a confirmation the API does not have.

What it does **not** do is delete the cold objects. Those stay thirty days; see
`packages/infrastructure/docs/reference/cold-storage.md`.

## `ExportOrganizationUseCase` — queued, and the day is the request's

An export is a full read of seven tables plus the catalog, streamed to S3. It is a job, like a
restore and unlike a delete, and the shape is the restore's: validate, audit, enqueue, hand back
the job id.

The day comes from the clock **once**, in the use-case, and travels in the payload. A retry the
next morning then writes the objects the job id already claimed rather than a second day's set.
The id is dotted — `tenant-export.<organization>.<day>` — because BullMQ rejects a colon.

`ListTenantExportsUseCase` reads the bucket rather than a table, and that is deliberate: nothing
records an export in Postgres, so there is no second index to disagree with what is actually
downloadable. Every URL is presigned for fifteen minutes, which is why the query that reads them
has `staleTime: 0` — a cached page is a page of links that have quietly stopped working.

What the export **does not** carry is the hashes. `invitations.token_hash` and
`api_keys.token_hash` are nulled on the way out: a hash is a credential, not data the customer
owns, and handing one back is handing back the ability to brute-force the key it was made from.

## The projection policy is composed in one place, read in three

`RetentionRules.clickhouseTtlFrom(retentionRows, projectionRows)` is the whole expression. The
screen reads it to show what the store *should* hold, `UpdateProjectionPolicyUseCase` writes it
after a save, and the nightly `retention` job converges to it. Three callers composing the same
string by hand is three places for it to drift, and the drift would only show as a TTL rewritten
every night.

Two rules inside it. An **excluded** action gets no clause: nothing writes it, so a window over
it is a rule on rows that do not arrive. And the expression is **compared before it is written**,
in the save as well as in the job — `MODIFY TTL` materialises every existing part, which on a
years-deep table is a rewrite.

The save's ClickHouse call is after the commit and its failure is logged rather than rethrown,
exactly as the retention save's is: the row is the truth, the nightly job closes the gap, and a
store that was unreachable must not fail a save that already committed.

## The projection switch is a pause, and the screen has three states

`platform_policy` is one row, and `check (id = 1)` is what makes that a database guarantee rather
than a convention — the repository reads it without an `order by`. The migration deliberately does
**not** insert it: an absent row is the defaults, so a deployment that never opens the screen
behaves exactly as the deploy before the table existed, and the first save is what creates it.

Off stops `AnalyticsConsumer.project()` and `reconcile()` and nothing else. The connection stays,
and the nightly `retention` job still converges the TTL — a TTL edit is not a projection. Resume
needs no stored state at all, because the checkpoint is read from the destination: the rows
written while it was off are exactly the ones the next run picks up.

Neither job logs while paused. 288 lines a day saying "paused" is noise, and the screen shows the
state; `reconcile` is silent for a second reason, which is that every day in the window would
report drift and say only what the switch already says.

`ToggleProjectionUseCase` refuses with `ConflictError("analytics", "not_configured")` when the
health report says `analytics === null`. That third state is why the screen renders three and not
two: rendering "not configured" as "off" invites someone to turn on a store that does not exist.

The screen quotes its deadline from the **retention rows**, not from a constant — the number it
shows is the same `activity_log` hot window the retention screen shows, so the two cannot
disagree about how long a pause stays recoverable.

## What lands here next

| Phase | Files |
|---|---|
| 19 | `retention-policy.repository.ts`, `retention.rules.ts`, `list-retention-policies`, `update-retention-policy`, `preview-retention-change`, `restore-partition`, `list-tenant-storage`, `tenant-retention-policy.repository.ts`, `update-tenant-retention`, `delete-organization`, `export-organization` |
| 20 | `projection-policy.repository.ts`, `platform-policy.repository.ts`, `list-projection-policies`, `update-projection-policy`, `toggle-projection`, `reproject-partition` |
| 22 · 24 | `inspect-shard-map`, `move-tenant` |

Every one asserts a `platform.*` key, and every write rebases its audit row.

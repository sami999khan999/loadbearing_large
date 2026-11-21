---
title: The platform slice
description: What a use-case above the tenant may assume, why its health seam is a slice port rather than a cross-cutting one, and the audit rebase that keeps a global change out of a customer's trail.
---

# `application/src/platform/`

Every other slice acts inside one tenant; this one acts above all of them.

## The actor is ordinary; the key is not

The `Principal` is ordinary — it carries whatever organization the session points at, often a customer
tenant. The key makes it platform work:

```ts
this.authorizer.assert(actor, "platform.status.read");
```

`platform.*` is `scope: "platform"`, so `can()` consults only the platform axis; a tenant `wildcard` never
reaches it (
[platform scope](../../../permissions/docs/reference/platform-scope.md)).

## The audit row is rebased, and it is a rule rather than a field

Recorded under the admin's active tenant, a global change would appear in a customer's trail. So
platform use-cases audit against the **tier**:

```ts
await this.activity.record(
  new Principal(await this.platform.organizationId(), actor.userId, actor.capabilities, actor.kind),
  "platform.policy.changed",
  { … },
);
```

Decision D38 — not a `Principal` field: authorization already ran against the real principal, and a
`rebasedFor` field is one more thing every other use-case must ignore. Every platform write follows it.

## `PlatformReader` — which organization is the tier

```ts
abstract class PlatformReader {
  abstract organizationId(): Promise<OrganizationId>;
  abstract organization(): Promise<PlatformOrganization>;
}
```

`organizationId` is read on **every RBAC write** (`CapabilityCache` decides whether to flush the platform
axis); `organization` adds slug and name for the screen. Both throw on a miss — `organizations_platform_uq`
allows at most one and `db:seed` makes one, so a miss is an unseeded, broken deployment.

## `PlatformHealthReader` — a slice port, not a cross-cutting one

It reports `Container.health()`, which a use-case cannot name (`composition` is to the right) — a seam
forced by layering. A slice port, not `port/` ([folders](../../../../docs/ai/rules/folders.md)): later
features added *files beside it* (`RetentionPolicyRepository`, `ProjectionPolicyRepository`,
`PlatformPolicyRepository`). `PlatformHealth` drops `pool` (one process's gauge). `replica()` (`25.1`)
folds every standby into one reading or `null`, kept out of `report()` — a lagging standby slows batch
reads but must not turn `healthy` false.

## `TenantStorageReader` — a slice port, and why cold only

A slice port for the same reason. `byTenant(page, organizationId)` filters before the limit (else a
page of twenty-five returns three). `monthsFor` is unpaginated (bounded by retention) and runs **only**
for a named tenant. The tenant comes off the input, not the principal — the admin is asking about someone
else's tenant, which is what `platform` scope is for.

## `ShardMapReader` — the directory as an operator reads it

All **catalog** reads — the directory cannot be routed by itself
([sharding](../../../infrastructure/docs/reference/sharding.md)).

- `nodes()` counts `shard_assignments` by node **without** joining `organizations` — an orphaned row is
  what an operator comes to find, and a new node honestly has no row.
- `tenantsOn(node, page)` runs only for a named node (all at once is the whole directory), carrying each
  tenant's **count** of retention overrides via a scalar subquery — two statements per page
  (`tests/platform/shard-map.spec.ts`).
- `findByTerm(term)` takes an id **or** slug, comparing `organizations.id::text = $1` (a slug cast to
  `uuid` is `22P02`); a miss is `null`, not `NOT_FOUND`.

## `moves` is two words, and it comes from the container

`InspectShardMapUseCase` and `LocateTenantUseCase` return `moves: "unavailable" | "available"` from
`Container.hasShardMoves` (`cluster.size > 1` — a move needs a second node). Two words, because
`movesEnabled: false` reads as a switch someone turned off; the seam keeps the decision in one container
line.

## `DeleteOrganizationUseCase` — the order is the behaviour

Archive every month, drop the tenant partitions, delete the row, flush:

- **Archive cutoff is the first of *next* month** — "what exists", not "what aged out".
- **`dropTenantPartitions` runs before and outside the transaction** — held DDL would block every other
  DDL.
- **Cache flush and analytics delete follow the commit** — before, the cache refills from undeleted rows.
- **Two refusals:** the tier (deleting it locks every admin out) and a typed slug checked server-side too.

Cold objects stay thirty days ([cold storage](../../../infrastructure/docs/reference/cold-storage.md)).

## `ExportOrganizationUseCase` — queued, and the day is the request's

A full read of the tenant tables plus catalog, streamed to S3 — a job (validate, audit, enqueue, return
the id). The day is read **once** and travels in the payload, so a next-morning retry rewrites the same
objects; the id `tenant-export.<organization>.<day>` is dotted (BullMQ rejects colons).
`ListTenantExportsUseCase` reads the bucket, not a table (nothing to disagree), with fifteen-minute
presigned URLs and `staleTime: 0`. **Hashes are nulled** (`invitations.token_hash`,
`api_keys.token_hash`) — a credential, not customer data.

## The projection policy is composed in one place, read in three

`RetentionRules.clickhouseTtlFrom(retentionRows, projectionRows)` is the one expression the screen shows,
`UpdateProjectionPolicyUseCase` writes and the nightly job converges to. Excluded actions get no clause,
and it is **compared before writing** — `MODIFY TTL` rewrites every part. The post-commit ClickHouse call
logs failure rather than rethrowing: the row is truth, the nightly job closes the gap.

## The projection switch is a pause, and the screen has three states

`platform_policy` is one row (`check (id = 1)`); the migration inserts none — absent means defaults, and
the first save creates it. **Off** stops `project()` and `reconcile()` only (the TTL still converges);
resume needs no state, since the checkpoint is read from the destination. Neither logs while paused (288
"paused" lines a day is noise). `ToggleProjectionUseCase` refuses `ConflictError("analytics",
"not_configured")` when `analytics === null` — hence three screen states. The deadline shown comes from
the `activity_log` retention row, matching the retention screen.

## The replica switch sits on the status page, beside the lag it governs

`platform_policy.replica_reads_enabled` is read once per run by `AnalyticsConsumer` (`24.3`) to place
tenants; `PgActivityReplayReader` then uses a caught-up standby. `ToggleReplicaReadsUseCase`
(`platform.replica.manage`) writes it.

- **On `/platform/status`**, beside the lag it governs (`replica: { healthy, lagSeconds, readsEnabled } | null`),
  needing only `platform.status.read`.
- **`null` means no standby, and the switch refuses** (`ConflictError("replica", "not_configured")`) —
  else a setting would already be on the day a standby arrives.
- **On is safe by construction** — a read uses the replica only once it has replayed everything the
  primary had at the read's start, so it is a capacity decision.

Every use-case here asserts a `platform.*` key, and every write rebases its audit row.

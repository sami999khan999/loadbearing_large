---
title: Platform admin plan — the tier, retention, projection policy, the replica panel
updated: 2026-09-16
owner: sami
schema: plan/v1
source: tree at 1135d57 (claude/sleepy-franklin-yqa9av), 2026-09-14
---

# Platform admin plan

> **How to use this file**
>
> 1. Every item has a unique ID (`A2.3`). Never reuse or renumber one.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing.
> 3. Phases run in order — a phase may start when the previous phase's **Exit** line is true.
>    **Phase 2 also needs `DB-SCALING-PLAN.md` section 2.C built**: there is no cold storage to
>    manage until it exists. Phase 4 is filed behind `S4.4` and is listed so nobody plans it twice.
> 4. Every item that touches code lists the doc it must update. A code change with the doc
>    untouched is not done. `docs/opinions/` wins over `docs/ai/rules/`.
> 5. Every new procedure binds three files to one commit: its permission mapping, its procedure
>    map, and its `apps/web` router (`packages/contracts/src/procedure/index.ts` says so).
> 6. `TODO.md` stays the task ledger: `T-038` points here.
> 7. Commit per layer with the closed `scope-enum`. No scope is added: no package is added. No
>    author or tool trailers (`docs/ai/rules/workflow.md`).

---

## Context

The scaling plan chose to keep retention as a constant on `PartitionedTable.ALL` (its decision 14)
and deferred two items — `S2.15`, retention as a row an operator edits, and `S5.6`, the platform
tier that row needs an editor for — because there was no authorization scope above an
organization and building one for a single number was not worth it. The request that reopens
both is bigger than a number: an administrator should manage **what is projected to ClickHouse
and for how long, what goes to cold storage and for how long, and the read replica**, from a
screen, without a deploy. Three of those are global settings, so the tier is no longer optional,
and "using RBAC" fixes its shape: the grant rides the roles and permissions the kit already has.

What exists is more than it looks. Retention per table is already a frozen list with a
`retentionMonths` on each entry. The ClickHouse table already has a TTL, in DDL nothing can
change after first boot. The archive gateway already writes prefix-shaped keys, and three
separate comments say the layout is for lifecycle rules that nothing has ever set. The roles
screen, the permission matrix, the nav gate, the route guard and the settings-page template are
all copyable as they stand. What does not exist is any scope above a tenant, any list of activity
actions, any ClickHouse migration path, and any place a policy row could live.

This file is the plan: four phases in the shape of `DB-SCALING-PLAN.md`, item IDs `A<phase>.<n>`.

A second pass on 2026-09-15 read the plan against the question "what can the admin choose, and is
there anything more", and found four controls it did not build and one switch it did not have. It
planned every switch that can open a hole in ClickHouse and no action that fills one — nothing in
the repository reads a cold-storage object back. Lowering a retention number silently scheduled a
mass drop with no preview. Cost per tenant was not computable, because the S3 adapter computes
every object's size and the archive gateway discards it. There was no projection on/off switch,
and adding one made a latent gap — an archived month the projection never read — reachable by a
click. And the daily reconcile never read the archived row counts, despite the schema comment
saying that is the only check covering the cold window. Two things from that pass went to the
scaling plan instead: `messages` is partitioned now (`S2.6`), and `S2.19` adds the partition-estimate
read the preview here consumes. Queue-job retention was checked and is already capped, so it is
not filed.

On 2026-09-16 the scaling plan's shard became the organization and its tenant became a partition
(its decisions 19 and 20). Three things follow here: retention can now differ per tenant, so the
screen gains an override row (`A2.19`); a tenant can now be deleted as seven partition drops and a
catalog cascade, so deletion becomes a platform action (`A2.20`); and the shard map is one row per
node with tenants underneath, because there is no longer a 256-row grid to show.

### Decisions recorded up front (do not re-litigate)

1. **The platform tier is an organization.** `organizations.is_platform` marks it, a partial
   unique index guarantees at most one, and `pnpm db:seed` marks the `loadbearing` organization
   it already creates. Platform permissions are held the way every permission is held — through
   a membership and a role in that organization — and are resolved **per user**, once, and merged
   into every principal that user gets in any tenant. A platform admin switched to a customer
   tenant is still a platform admin. That is what "using RBAC" means here: no env list, no flag
   on `users`, no second permission system.
2. **`platform` is a third scope, and it is never reached by accident.** `PermissionScope` becomes
   `"org" | "goal" | "platform"`, `CapabilitySet` gains a third axis, and `can()` gains an explicit
   branch: a platform key is granted only by the platform set, denied by the platform set, and
   touched by nothing else — a tenant's `wildcard` does not reach it, the `core` exception does
   not apply, `owner: "all"` excludes it at seed time, and an API key's `intersect` empties it.
   Four places would otherwise leak it; each is an item in Phase 1.
3. **The first platform admin is seeded by a script; every later one is invited.** The grant
   use-case refuses a key the granter does not hold, which is the right rule and means nobody can
   grant the first `platform.*` key through the API. `pnpm platform:grant <email>` puts one user
   into the platform organization as `platform_admin`. After that, platform admins use the
   existing members screen with the platform organization active.
4. **Absent row = the code default, for every policy table.** Borrowed from
   `notification_preferences` and from the deferred `S2.15`: an empty table changes no
   behaviour, so the migration is safe and the first edit is the first change.
5. **The application owns the bucket lifecycle configuration.** One `PutBucketLifecycleConfiguration`
   composed from every retention row, issued after the admin's write commits and again by a daily
   reconcile, because the S3 call replaces the whole configuration and a failed post-commit call
   must self-heal. A second port, not a method on `StorageGateway`: that port's header says "no
   bucket, no region, no endpoint — those are adapter configuration", and a lifecycle rule is
   bucket-shaped policy. Expiration only; a colder storage class is filed, not built.
6. **The projection filter is one list, read by three queries.** Excluding an action from
   ClickHouse must be applied by the replay query *and* by both sides of the daily reconciliation,
   or the reconciliation reports drift every day and stops being read. A per-action TTL longer
   than the default is only expressible if the default clause carries `WHERE action NOT IN (…)`,
   because an unconditioned TTL clause deletes every row it matches.
7. **ClickHouse gets a migration path before the app issues any DDL against it.**
   `infra/clickhouse.init.sql` runs only on an empty volume and never on a managed instance; it
   becomes migration `0000`, a version table lives in ClickHouse, and `pnpm ch:migrate` applies
   what is missing. Every later schema change — a materialized column, a new table — is a file.
8. **Table names never come from data.** Postgres takes no bind parameter in DDL and the adapters
   inline the name, so `PartitionedTableName` and the closed action catalog are the injection
   boundary. A screen edits the number beside a name from a list; it never accepts a name.
9. **Platform actions are audited under the platform organization.** A platform admin's active
   tenant is whichever they switched to, and an audit row under it would misattribute the change.
   Platform use-cases rebase the actor onto the platform organization for the audit call only.
10. **The replica panel is filed behind `S4.4`.** There is no routing to manage until the scaling
    plan builds it; a panel before that shows a health field and nothing to switch.
11. **No new package, no new dependency, one new cross-cutting port, no new file suffix.**
    `PutBucketLifecycleConfigurationCommand` ships inside `@aws-sdk/client-s3`. The port is
    `StoragePolicyGateway`. Slice ports stay in the slice. `Policy`, `Rules`, `Reader`,
    `Repository`, `Gateway` are all existing role nouns.
12. **The ClickHouse switch is a pause, not a power switch.** (2026-09-15) The environment decides
    whether the store runs; the switch decides whether it is used. Three states on screen: not
    configured (toggle disabled), on, off. Off pauses the projection, the reconcile, the lag alarm
    and the drift alarm together — a paused projection with live alarms trains people to ignore them.
13. **A gap is recorded on the archive index, never silent, and never blocks a drop.** (2026-09-15)
    `partition_archive.projected_at` null means ClickHouse never received that tenant-month. The
    re-project action reads those rows and stamps them. The scaling plan's decision 18 is the other half.
14. **Both switches live in one single-row table.** (2026-09-15) `platform_policy (id = 1,
    projection_enabled, replica_reads_enabled)`, typed columns rather than a key-value bag. Resolves
    where `A4.2`'s switch lives.
15. **Cold storage is read back through the worker, not through ClickHouse's `s3()` table function.**
    (2026-09-15) The convention that lifts `subject_id` out of the payload is one TypeScript
    function, and an SQL copy of it is a second implementation of a convention. The scaling plan's
    reader, whole-object at the ~8 MB tenant-month bound `S5.1` already accepts, with streaming as
    the same escape hatch. One reader, two sinks.
16. **Every destructive setting shows its consequence before the save.** (2026-09-15) From a read on
    the maintenance port (`S2.19`), the same numbers the retention screen shows beside each table.
17. **Sharding gets a map now and a button that waits.** (2026-09-15) The map reads `shard_assignments`
    once `S3.3` lands; the move procedure lands with `S4.2`; the contract carries
    `moves: "unavailable" | "available"` from a container getter that `S4.2` flips, so the screen
    never guesses.
18. **`messages` is partitioned with `retentionMonths: null`.** (2026-09-15) Messages are domain data
    and are never dropped; the retention screen lists the table read-only, "never dropped".
19. **Per-tenant retention is an override row, with the table default as the fallback.** (2026-09-16)
    Hot months are exact, because prune drops that tenant's month child. Cold months per tenant are
    enforced by the worker's sweep, not by the bucket: lifecycle rules match a prefix and are capped
    at 1,000 per bucket, so the per-table rule stays as the ceiling and the app enforces anything
    shorter.
20. **Tenant deletion archives first, drops the tenant's partitions, lets the catalog cascade, and
    keeps cold objects thirty days.** (2026-09-16) A platform action under its own key. Nothing is
    destroyed at the click; the sweep thirty days later is what forgets the tenant.
21. **Structure is a file; policy is the dashboard; the line is "does changing it rewrite a
    table".** (2026-09-16) Which tables are split, by what key and by what time column, is one
    allowlist line and a generated migration (`S2.20`, `S2.25`). Every number and switch over that
    structure is a screen. A control that re-partitions a live table is a deploy wearing a
    setting's clothes, and it is not built.

### What the admin changes, and what stays a file

| Change | Where | Why there |
|---|---|---|
| Which tables are split by tenant, by month, or both | one line in `packages/application/src/primitive/partitioned-table.ts`, then `db:generate` (`S2.20`, `S2.25`) | table structure |
| Which tables are shared versus per-tenant | the catalog list (`S3.1`) | structure |
| What the shard key is | the `TenantKey` alias and one strategy class (`S3.21`'s four-edit recipe) | one place, replaced whole |
| How long each table keeps data | `/platform/retention` (`A2.3`) | a number |
| How long one tenant keeps data | the tenant row (`A2.19`) | a number |
| Which server a tenant lives on | the shard map, once the split exists (`A4.4`, `A4.5`) | one directory row |
| Whether ClickHouse is on, what reaches it, for how long | `/platform/analytics` (`A3.1`, `A3.8`) | switches and numbers |
| Restore, re-project, delete a tenant | the screens (`A2.18`, `A3.10`, `A2.20`) | actions over structure |

**Deliberate constants.** The runway of two future months, the projection cadence of five minutes
and its ten-minute lag alarm, the daily and monthly cron times, batch sizes, cache TTLs, and the
thirty-day grace before a deleted tenant's cold objects are swept. Each is a code constant with its
reason beside it. Two of them — the runway and the grace — are policy-shaped and could move onto
`platform_policy` in an afternoon if an operator asks; none of the others should, because a screen
that edits a cron pattern has to re-register every repeatable job, and there is no user for it.

### What exists and is reused (verified against the tree at `1135d57`)

- `PermissionRegistry`, `CapabilitySet`, `Authorizer.assert`, `RoleRules.assertKnownPermission`,
  the no-escalation rule at `grant-permission.use-case.ts:32` — the tier extends these, replaces none.
- `PgCapabilityRepository` — three targeted queries; the platform resolution is a fourth, keyed on
  the user alone. `CapabilityCache` — the read-through shape, with a second prefix.
- `SystemRoleSeed`, `PgOrganizationFounder`, `seed.ts`, the `loadbearing` organization.
- `permission_overrides` — a platform deny for one user works unchanged once the scope exists.
- `RouteGuard.requirePermission`, `<Can>`, `ModuleNav`, `settings/roles.tsx` — the four surfaces
  a gated page uses; every platform page copies `roles.tsx`.
- `PermissionMatrix` — renders every registry key grouped by module; the `CORE_MODULE` exclusion
  is the precedent for hiding the `platform` module from a tenant's role editor.
- `PartitionedTable.ALL` with `retentionMonths` — the code default the retention rows fall back to.
- `notification-preference.form.tsx`, `NotificationMutations.useUpdatePreference` (no optimistic
  update, on purpose), `notification.procedures.ts` `preferences`/`updatePreference` — the
  per-row settings shape.
- `ClickHouseConnection.command()` — public, unused, exactly what a migration runner needs.
- `PgActivityReplayReader.since` / `dailyCounts`, `ClickHouseAnalyticsProjector.dailyCounts` — the
  three queries decision 6 puts one list in front of.
- `MaintenanceConsumer` and its schedules — the daily reconcile joins the `cleanup` cadence.
- `docs/ai/skills/add-slice.md` — the twelve steps; Phase 2 and 3 are each one slice.
- `StoredObject.size` — computed by the S3 adapter on every put and discarded by the archive
  gateway; the scaling plan's `S2.11` keeps it from 2026-09-15.
- `PgActivityReplayReader.subjectOf` — becomes `ActivitySubject.of` in `application/src/primitive/`,
  shared by the replay reader and the re-project sink.
- `PgMaintenanceGateway.childrenOf` — private today; `S2.19` widens it and builds the public read beside it.
- `Container.health()` and its `analytics: boolean | null` — the "not configured" state already
  exists as a value.
- The scaling plan's `ColdArchiveReader` port and `S2.13`'s scratch-table restore; `S5.1`'s ~8 MB
  bound and its streaming escape hatch.

---

## The phases

### Vocabulary fixed up front

| Thing | Name |
|---|---|
| Scope | `platform`, on `PermissionScope` and on `roles.scope` |
| Column | `organizations.is_platform boolean not null default false`, `organizations_platform_uq` partial on `(is_platform) where is_platform` |
| System role (platform org only) | `platform_admin`, `is_system`, `scope = 'platform'`, every `platform.*` key |
| Permission keys (`packages/permissions/src/catalog/platform.permissions.ts`, module `platform`, scope `platform`) | `platform.status.read`, `platform.retention.read`, `platform.retention.manage`, `platform.analytics.read`, `platform.analytics.manage`, `platform.storage.read`, `platform.shards.read`, `platform.shards.manage` (procedure with `S4.2`), `platform.tenant.manage` (`A2.20`); `platform.replica.manage` arrives with `S4.4`. Restore-to-Postgres is under `platform.retention.manage`; re-project and the switch under `platform.analytics.manage` |
| Routes (`route/platform.routes.ts`) | `/platform/status`, `/platform/retention`, `/platform/analytics`, `/platform/storage`, `/platform/shards` |
| Gate (`gate/platform.gate.ts`) | `platform: { permission: "platform.status.read", route: ROUTES.platform.status }` |
| Tables (catalog, tenant-exempt) | `retention_policy (store, table_name) pk`, `projection_policy (action) pk`, `platform_policy (id smallint pk, check (id = 1))`; `partition_archive` gains `bytes`, `action_counts`, `projected_at` in the scaling plan's `S2.11`. Not exempt, because it leads with the tenant: `tenant_retention_policy (organization_id, table_name) pk` (`A2.19`) |
| Primitive | `application/src/primitive/activity-subject.ts` → `ActivitySubject.of(payload)`, lifted out of `PgActivityReplayReader` |
| Action catalog (`packages/contracts/src/catalog/`) | `<slice>.actions.ts` fragments → `ACTIVITY_ACTIONS`; `ActivityAction`, `ActivityActions.isKnown` in `registry/` |
| Application slice `platform/` | `retention-policy.repository.ts`, `projection-policy.repository.ts`, `platform.reader.ts` (ports); `retention.rules.ts`; `list-retention-policies`, `update-retention-policy`, `list-projection-policies`, `update-projection-policy`, `inspect-platform-status` use-cases; second pass: `platform-policy.repository.ts` (port); `preview-retention-change`, `list-tenant-storage`, `restore-partition`, `reproject-partition`, `toggle-projection`, `inspect-shard-map` use-cases, `move-tenant` with `S4.2`, `toggle-replica-reads` with `S4.4`; third pass: `tenant-retention-policy.repository.ts` (port), `update-tenant-retention`, `delete-organization` use-cases |
| Cross-cutting port | `application/src/port/storage-policy.gateway.ts` → `StoragePolicyGateway { lifecycle(), applyLifecycle(rules) }`, `LifecycleRule { prefix, expireAfterDays }` |
| Infrastructure | `pg/schema/platform.schema.ts`, `pg/repository/pg-retention-policy.repository.ts`, `pg-projection-policy.repository.ts`, `pg-platform.reader.ts`, `pg-platform-policy.repository.ts`, `pg/seed/platform-role.seed.ts`, `s3/s3-storage-policy.gateway.ts`; scripts above `src/`: `platform-grant.ts`, `clickhouse-migrate.ts`, `clickhouse-migrations/` |
| Cache prefix | `capability:platform:<userId>`, 60 s, `invalidatePlatform()` on the invalidator |
| Content namespace | `platform` |
| Query keys | `QueryKeys.platform.status()`, `.retention()`, `.retentionPreview(table, months)`, `.projection()`, `.policy()`, `.storage()`, `.shards()` |
| Worker jobs | `retention` on `QueueName.MAINTENANCE`, daily at 03:30, `RetentionSchedule`; `cold-restore` and `cold-reproject` on `MAINTENANCE`, enqueued by use-cases with `jobId: "<job>:<table>:<period>:<org|all>"` so a double click is one job |
| Log event codes | `retention.lifecycle.applied` (info), `retention.lifecycle.drifted` (warn), `retention.rows.expired` (info), `analytics.retention.applied` (info), `cold.partition.reprojected` (info, `{ period, organizationId, rows }`); `analytics.projection.gap` (warn) is declared in the scaling plan's `S2.14` and `cold.partition.restored` in its `S2.13`. `platform.policy.changed`, `platform.projection.paused`, `platform.projection.resumed`, `platform.restore.requested`, `platform.reproject.requested`, `platform.tenant.move_requested`, `tenant.retention.changed`, `tenant.deleted`, `tenant.export_requested` are **activities**, not log codes; `cold.objects.swept` gains `reason: "tenant_deleted"` (`A2.20`); `cold.tenant.exported` (info, `A2.21`) |
| Scripts | `pnpm platform:grant <email>`, `pnpm ch:migrate`; `pnpm db:generate` has two halves after the scaling plan's `S2.25` |
| Docs pages (new) | `packages/permissions/docs/reference/platform-scope.md`, `packages/application/docs/reference/platform.md`, `packages/infrastructure/docs/reference/clickhouse-migrations.md`, `packages/infrastructure/docs/reference/storage-policy.md`, `packages/infrastructure/docs/reference/cold-restore.md` |

---

### Phase 1 — The platform tier, on RBAC

**Goal.** A user holding `platform.*` keys through a role in the platform organization sees
`/platform` from any tenant; a tenant owner does not, cannot grant a platform key, and cannot see
one in the role editor; the first admin is seeded by a script; every surface that reads
capabilities carries the third axis; `check:architecture` stays green.

**Design in one paragraph.** `PermissionScope` gains `"platform"`; `CapabilitySetDto` gains
`platform: ScopedSetDto` and `can()` gains the explicit branch decision 2 describes.
`PgCapabilityRepository.resolvePlatformFor(userId)` reads the user's active membership in the
organization where `is_platform`, its role's `role_permissions`, and the user's
`permission_overrides` in that organization, keeping only keys whose registry scope is `platform`.
`CapabilityCache.platformFor(userId)` caches it under its own prefix; `PrincipalBuilder.fromHeaders`
merges it into the tenant set after the membership check; the API-key path and both system
principals get an empty platform set. `SystemRoleSeed` resolves `owner: "all"` over every key
**except** platform scope; a new `PlatformRoleSeed` runs only for the platform organization and
seeds `platform_admin`. `pnpm platform:grant` is the bootstrap. The wire DTO in
`role.contract.ts` and the SSR snapshot carry the axis, so `RouteGuard` and `<Can>` work unchanged.
The permission matrix hides the `platform` module unless the active organization is the platform
one. A `/platform/status` page and its nav gate prove the tier end to end before any policy exists.

#### 1.A The scope (`permissions`, `application`)

- [ ] `A1.1` **Third scope** — `permission-registry.ts` `PermissionScope = "org" | "goal" | "platform"`;
  `PermissionRegistry.byScope(scope)` beside `byModule`, so the seed and the matrix can exclude by
  scope rather than by module name. `capability-set.ts`: `CapabilitySetDto.platform: ScopedSetDto`
  (`from()` treats a missing axis as empty, so a stale cached DTO degrades to "no platform rights"
  rather than throwing), `platformSet`, and the branch in `can()`: `scope === "platform"` → deny if
  platform denies, grant if platform grants, else `false`; `wildcard` and `isCore` are not
  consulted. `intersect()` sets `platform` to empty. `empty()` includes it. Spec: the four leak
  paths from decision 2, each as a case that fails without the branch. **Docs:** new
  `packages/permissions/docs/reference/platform-scope.md` (registered in `reference/meta.json` and
  `docs/index.md`), `docs/opinions/vocabulary.md` scope row, `docs/ai/rules/vocabulary.md` qualifier line.
- [ ] `A1.2` **Keys, routes, gate** — `catalog/platform.permissions.ts` with the nine keys from the
  vocabulary (`platform.shards.manage` is registered now so the seed grants it; its procedure
  arrives with `S4.2`), spread into `CATALOG`; `route/platform.routes.ts`; `gate/platform.gate.ts` gating the
  `platform` nav module on `platform.status.read`. `ModuleRegistry.isVisible` needs no change: it
  calls `can()` and the new branch answers. **Docs:** `packages/permissions/docs/index.md` tree.
- [ ] `A1.3` **`Principal` carries nothing new; the audit rebase is a rule, not a field** —
  `application/src/platform/platform.reader.ts`: `PlatformReader.organizationId(): Promise<OrganizationId>`
  (throws `InternalError` if no organization is marked — the seed guarantees one). Platform use-cases
  call `activity.record(new Principal(platformOrganizationId, actor.userId, actor.capabilities, actor.kind), …)`
  with the comment from decision 9. **Docs:** `packages/application/docs/reference/platform.md` (new).

#### 1.B Resolution and cache (`infrastructure`, `auth`)

- [ ] `A1.4` **`organizations.is_platform`** — `rbac.schema.ts` gains the column and the partial unique
  index; `roles.scope` enum gains `"platform"`; migration generated then hand-checked (§20: a
  `boolean not null default false` is safe on a populated table). `seed.ts` marks the `loadbearing`
  organization `is_platform = true` after creating it. **Docs:** `docs/setup/13` §13.3, `docs/opinions/vocabulary.md` table list.
- [ ] `A1.5` **`PgCapabilityRepository.resolvePlatformFor(userId)`** — one query for grants
  (`memberships ⋈ roles ⋈ role_permissions` where `organizations.is_platform`, `deactivated_at is null`)
  and one for overrides, filtered in code to `scopeOf(key) === "platform"` after `isKnown`. The port
  `CapabilityRepository` gains the method. `CapabilityCache.platformFor(userId)` under
  `capability:platform:<userId>`, 60 s; `CapabilityInvalidator.invalidatePlatform()` deletes the
  prefix, and every RBAC write use-case calls it **when the actor's organization is the platform one**
  (a role edit in a customer tenant cannot change a platform grant). **Docs:** the capability page
  under `packages/auth/docs/reference/`, `docs/setup/16`.
- [ ] `A1.6` **`PrincipalBuilder` merges** — after `memberships.isActive`, `capabilities.forUser` and
  `capabilities.platformFor` run in parallel and the principal is built from the merged DTO. The
  API-key branch and `SystemPrincipal.platform()`/`forOrganization()` pass an empty platform set
  explicitly. `session.fn.ts` ships the merged `toJSON()`, so the router context and `SessionProvider`
  carry it with no change. **Docs:** `apps/web/docs/reference/enforcement-surfaces.md` (the DTO now
  has three axes; the surface count does not grow).
- [ ] `A1.7` **The wire DTO** — `role.contract.ts` `capabilities` schema gains `platform: scopedSet`
  (the contract restates the DTO on purpose; it must be restated here too). `packages/query`'s
  session snapshot type follows from the contract. **Docs:** `packages/contracts/docs/index.md`.

#### 1.C Seeds, the first admin, the matrix (`infrastructure`, `feature`, `application`)

- [ ] `A1.8` **`owner: "all"` stops at the tenant** — `SystemRoleSeed` resolves `"all"` as
  `PermissionRegistry.instance.all().filter(scope !== "platform")`, with the comment that a tenant
  owner is not a platform admin. `reconcile()` therefore removes any platform key a tenant `owner`
  might hold from an earlier deploy. Spec pins it. **Docs:** `docs/setup/13` §13.4 seed paragraph.
- [ ] `A1.9` **`PlatformRoleSeed`** — `pg/seed/platform-role.seed.ts`, same idempotent shape as
  `SystemRoleSeed`, runs only for the organization where `is_platform`: one role `platform_admin`,
  `is_system`, `scope = 'platform'`, holding `PermissionRegistry.instance.byScope("platform")`,
  reconciled on every seed so a new platform key reaches admins on the next deploy. `seed.ts` calls
  it after marking the organization. `RoleRules.RESERVED_KEYS` gains `platform_admin`. **Docs:** `docs/setup/13` §13.4.
- [ ] `A1.10` **`pnpm platform:grant <email>`** — `packages/infrastructure/platform-grant.ts` above
  `src/` (the rule for runnable scripts), over `DATABASE_DIRECT_URL ?? DATABASE_URL`: find the user by
  email, find the platform organization and its `platform_admin` role, upsert the membership
  (insert, or change the role if already a member), print what it did. Root `package.json` script.
  The only way the first platform admin exists; the members screen is the way every later one does.
  **Docs:** `docs/ai/rules/workflow.md` command block, `docs/setup/13` §13.5.
- [ ] `A1.11` **The tenant role editor cannot see platform keys** — `PermissionMatrix` takes an
  `excludeScopes` prop; `RoleMatrix` passes `["platform"]` unless the session's active organization is
  the platform one (the SSR snapshot gains `isPlatformOrganization: boolean`, read off `organizations`
  by `session.fn.ts`). The grant use-case already refuses a key the granter does not hold; this item
  removes the checkbox that would have produced the 403. **Docs:** `packages/feature/docs/index.md`.
- [ ] `A1.12` **`/platform/status`, the proof page** — `packages/application/src/platform/inspect-platform-status.use-case.ts`
  (`authorizer.assert(actor, "platform.status.read")`, returns `Container.health()`'s report plus the
  platform organization's id and name); contract `platform.status` + `catalog/platform.permissions.ts`
  entry + `platform.router.ts` + `contract.platform` + `appRouter.platform` (one commit, rule 5);
  `PlatformQueries.status`; `feature/src/platform/platform-status.panel.tsx`; route
  `(app)/_authenticated/platform/status.tsx` copied from `settings/roles.tsx` with
  `RouteGuard.requirePermission("platform.status.read")`; content namespace `platform` (the three
  edits in `namespace.ts`, two lines in `catalog.ts`, `en/platform.ts`, `bn/platform.ts`); nav item
  in the content nav list. The page also shows the projection's three states read-only —
  `health().analytics === null` is "not configured", otherwise `platform_policy` (`A3.8`) says on
  or off — while the control itself lives on `/platform/analytics`. **Docs:**
  `apps/web/docs/reference/enforcement-surfaces.md` gains nothing new,
  `packages/content/docs/reference/namespace.md`.
- [ ] `A1.13` **§9 and the tripwires** — `check-architecture.mjs` §9 needs no change in this phase
  (no new table); `test-container.spec.ts` needs no change (no new cross-cutting port). Note both
  here so Phase 2 does not forget they exist. `docs/ai/skills/add-slice.md` step 1 gains "scope is
  `org` unless the slice is platform-wide, and then it is `platform` and its keys never reach a
  tenant role".
- [ ] `A1.14` **Docs** — `docs/opinions/data-and-scale.md` §1: the super-admin dashboard now has a
  tier and this file is where it lands; `platform-scope.md` (`A1.1`): the three axes, the four leak
  paths and what closes each, the platform organization, the seed script, why not an env list.

**Exit.** `pnpm db:seed` marks `loadbearing` platform and seeds `platform_admin`;
`pnpm platform:grant alice@example.test` prints the membership; signed in as alice with a customer
tenant active, `/platform/status` renders and the nav shows the module; signed in as a tenant owner,
`/platform/status` redirects to `/forbidden` and the role editor shows no `platform` module;
a tenant owner calling `role.grant` with a platform key gets `FORBIDDEN`; the capability spec fails
each of decision 2's four leak paths with the branch removed; `pnpm check:architecture` 20/20 and
every suite green.

---

### Phase 2 — Retention: hot months, cold months, cold mode, and the ClickHouse TTL

**Depends on:** Phase 1 Exit, and `DB-SCALING-PLAN.md` section 2.C (`S2.10`–`S2.17`) built.

**Goal.** One screen lists every partitioned table with its hot months, cold months and cold mode,
and the ClickHouse table with its TTL; a change is a row, audited, applied by the worker on its
next run and by the bucket and ClickHouse immediately after commit; an empty table behaves exactly
as the code defaults do; the bucket's lifecycle configuration is always derivable from the rows.

**Design in one paragraph.** `retention_policy (store, table_name, hot_months, cold_months,
cold_mode, updated_at)` with `store in ('postgres','clickhouse')`. `RetentionRules` is the pure
composer: `lifecycleFor(rows)` returns one `LifecycleRule` per postgres table with a `cold_months`,
prefix `cold/<table>/`, `expireAfterDays = ceil(months × 30.44)`; `clickhouseTtlFor(row, perAction)`
returns the TTL expression Phase 3 extends. `UpdateRetentionPolicyUseCase` asserts
`platform.retention.manage`, validates against `PartitionedTable.NAMES` (never a free name,
decision 8), writes the row and the audit inside `unitOfWork.run`, then **after commit** calls
`storagePolicy.applyLifecycle(RetentionRules.lifecycleFor(all rows))` and, for the clickhouse row,
`projector.applyRetention(...)`. A daily `retention` job in `MaintenanceConsumer` recomputes both,
reads back what the bucket and `system.tables` hold, applies on difference, emits `drifted` when the
row and the store disagreed, and deletes `partition_archive` rows whose period is older than the
table's cold months — an expired object with a row still pointing at it is a `NotFoundError` on the
archived-notifications read. `prune()` reads `hot_months` from the row and falls back to
`retentionMonths`; `cold_mode = 'drop'` skips the archive step for that table.

#### 2.A ClickHouse can change (`infrastructure`, `infra`)

- [ ] `A2.1` **Migration path** — `packages/infrastructure/clickhouse-migrations/0000_activity_events.sql`
  is `infra/clickhouse.init.sql` moved. `packages/infrastructure/clickhouse-migrate.ts` above `src/`
  creates `schema_migrations (version UInt32, name String, applied_at DateTime) ENGINE = MergeTree ORDER BY version`
  if absent, then applies every file whose version is not in it, in order, one `command()` per
  statement. `pnpm ch:migrate` at the root, a no-op with a printed sentence when `CLICKHOUSE_URL` is
  unset. Compose stops mounting the init file; `docs/setup/11` and `docs/setup/15` say
  `pnpm ch:migrate` is the step. `check-architecture` §15 sees the moved path. **Docs:** new
  `packages/infrastructure/docs/reference/clickhouse-migrations.md` (registered), `clickhouse.md`
  gains "how the schema changes", `docs/infra/reference/clickhouse.md`, `docs/ai/rules/workflow.md`
  command block.
- [ ] `A2.2` **`AnalyticsProjector.applyRetention` and `retention()`** — the port gains
  `retention(): Promise<string>` (the current TTL expression read from `system.tables.engine_full`,
  normalised) and `applyRetention(expression): Promise<void>` (`ALTER TABLE … MODIFY TTL`, one
  `command()`). `MODIFY TTL` materialises on existing parts, which is a rewrite; the caller compares
  first and applies only on difference, which is why `retention()` exists. **Docs:** `clickhouse.md`,
  `packages/application/docs/reference/ports.md`.

#### 2.B The slice (`application`, `infrastructure`, `contracts`, `composition`)

- [ ] `A2.3` **Schema** — `pg/schema/platform.schema.ts`: `retention_policy` as above, primary key
  `(store, table_name)`, `check` constraints on `store` and `cold_mode`, `hot_months >= 1`,
  `cold_months >= 0` or null. Global, so a `TENANT_EXEMPT` line in §9 with the comment: a partition
  spans every tenant, so a per-tenant retention row would describe something the storage engine
  cannot do. Migration generated. **Docs:** `docs/setup/13` §13.3, `docs/setup/26` §9 entry.
- [ ] `A2.4` **Port and adapter** — `application/src/platform/retention-policy.repository.ts`
  (`all()`, `findBy(store, table)`, `save(row)`); `pg-retention-policy.repository.ts`, `catalog`
  placement once `S3.7` lands (until then, the ordinary base constructor). `PlatformReader` (`A1.3`)
  gets its `PgPlatformReader`. **Docs:** `platform.md`.
- [ ] `A2.5` **`StoragePolicyGateway`** — `application/src/port/storage-policy.gateway.ts`:
  `LifecycleRule { readonly prefix: string; readonly expireAfterDays: number }`,
  `lifecycle(): Promise<readonly LifecycleRule[]>`, `applyLifecycle(rules): Promise<void>`.
  `infrastructure/src/s3/s3-storage-policy.gateway.ts` over `GetBucketLifecycleConfigurationCommand`
  / `PutBucketLifecycleConfigurationCommand` (both added to `import.ts` under the existing banner;
  no new dependency), each rule `{ ID: prefix, Filter: { Prefix }, Status: "Enabled", Expiration: { Days } }`;
  a bucket with no configuration reads as `[]` (`NoSuchLifecycleConfiguration` is the empty case,
  not an error). `InMemoryStoragePolicyGateway` in `composition/src/fake/`. **Tripwire:**
  `test-container.spec.ts` pins the port list — twenty-six now — and `TestPorts` gains the entry.
  MinIO honours the same API with the root credentials the compose stack already uses; `minio-init`
  needs no change. **Docs:** new `packages/infrastructure/docs/reference/storage-policy.md`
  (registered), `docs/infra/reference/minio.md` (the ILM paragraph it already gestures at), `ports.md`.
- [ ] `A2.6` **`RetentionRules`** — `application/src/platform/retention.rules.ts`, pure:
  `lifecycleFor(rows)` (one rule per postgres row with a non-null `cold_months`, sorted by prefix so
  two runs compare equal), `clickhouseTtlFor(defaultMonths, perAction)` (Phase 3 fills `perAction`;
  here it is `[]` and the expression is `toDateTime(occurred_at) + INTERVAL <n> MONTH`),
  `daysFor(months) = Math.ceil(months * 30.44)` with the comment that S3 counts days and the screen
  says "about". Unit spec with pinned expressions. **Docs:** `platform.md`.
- [ ] `A2.7` **Use-cases** — `list-retention-policies.use-case.ts` (`platform.retention.read`;
  returns every `PartitionedTable.ALL` entry joined to its row or the default, plus the clickhouse
  row or `ActivityEvents.DEFAULT_TTL_MONTHS = 60`, plus what the bucket and ClickHouse currently
  hold so the screen can show drift) and `update-retention-policy.use-case.ts`
  (`platform.retention.manage`; input `{ store, tableName, hotMonths, coldMonths, coldMode }`;
  `tableName` validated against `PartitionedTable.NAMES` or `"activity_events"`; the write and the
  `platform.policy.changed` audit — rebased per decision 9 — inside `unitOfWork.run`; the two
  `apply*` calls after it, failures logged as `retention.lifecycle.drifted` / not rethrown, because
  the row is the truth and the daily job closes the gap). **Docs:** `platform.md`.
- [ ] `A2.8` **Contract, procedures, permissions, router** — `contracts/src/platform/platform.contract.ts`
  (`retentionEntity`, `retentionUpdate`), `platform.procedures.ts` (`retention.list` GET
  `/platform/retention`, `retention.update` PUT `/platform/retention`), `catalog/platform.permissions.ts`
  entries, `platform.router.ts` handlers. **Docs:** `packages/contracts/docs/index.md`.
- [ ] `A2.9` **Container** — `container.platform = { status, listRetention, updateRetention }`;
  `storagePolicy` port on the container and on `TestPorts`; the repositories built like every other.
  **Docs:** `packages/composition/docs/reference/container.md`.

#### 2.C The worker applies it (`worker`)

- [ ] `A2.10` **`prune()` reads the row** — `MaintenanceConsumer.prune(table)`: hot months from
  `retentionPolicies.findBy("postgres", table)?.hotMonths ?? entry.retentionMonths`; `cold_mode`
  `'drop'` skips the archive step and drops directly (the `outboxIsBehind` guard stays regardless).
  **Docs:** `apps/worker/docs/reference/consumers.md`.
- [ ] `A2.11` **The `retention` job** — daily 03:30, `RetentionSchedule`, job `retention` on
  `MAINTENANCE`: compose the lifecycle from rows, read the bucket's, apply on difference and emit
  `retention.lifecycle.applied { rules }` or `retention.lifecycle.drifted { expected, actual }` first;
  same for the ClickHouse TTL via `projector.retention()` / `applyRetention()`,
  `analytics.retention.applied`; then delete `partition_archive` rows older than each table's cold
  months, `retention.rows.expired { table, rows }`. All four codes join `core.events.ts` **and**
  `event-shape.ts`. **Docs:** `apps/worker/docs/reference/schedules.md`, `docs/setup/09b` code table.

#### 2.D The screen (`query`, `feature`, `content`, `web`)

- [ ] `A2.12` **Query and mutation** — `PlatformQueries.retention(client)` (`staleTime` 60 s),
  `PlatformMutations.useUpdateRetention(client)` invalidating `QueryKeys.platform.retention()`; no
  optimistic update, for the reason `useUpdatePreference` gives. **Docs:** `packages/query/docs/index.md`.
- [ ] `A2.13` **`retention-policy.form.tsx`** — one `fieldset` per table: hot months (number),
  cold months (number, blank = never expires), cold mode (two buttons, `archive` / `drop`, the
  `MODES` shape from the notification form); the ClickHouse row shows months only. Beside each row,
  what the store currently holds, and a `Callout tone="warning"` when it differs. A second callout
  on the `drop` mode: a dropped month is not in cold storage and cannot be restored. `apps/web`
  route `platform/retention.tsx` from `roles.tsx`, read gate on the route,
  `<Can permission="platform.retention.manage">` around the editor. Copy in `en/platform.ts` and
  `bn/platform.ts`. **Docs:** `packages/feature/docs/index.md`.
- [ ] `A2.14` **Docs** — `docs/opinions/data-and-scale.md` §4.2's closing paragraph ("decide the
  retention policy at the same time") gains "and it is a row, with the allowlist as the default";
  `docs/ai/rules/data.md` retention bullet; `packages/infrastructure/docs/reference/cold-storage.md`
  (from `S2.17`) gains the lifecycle section; `DB-SCALING-DEFERRED.md` `S2.15` marked moved here.
- [ ] `A2.15` **Preview before a retention change** — depends on the scaling plan's `S2.19`.
  `preview-retention-change.use-case.ts` (`platform.retention.read`; input `{ tableName, hotMonths }`,
  `tableName` from `PartitionedTable.NAMES`; computes the cutoff the way `prune()` does and returns
  `maintenance.partitionsBefore(table, cutoff)` — `{ name, period, estimatedRows, bytes }[]` — plus
  totals). Procedure `retention.preview` GET `/platform/retention/preview`, the permission entry,
  the router, `PlatformQueries.retentionPreview` (`staleTime: 0`). `retention-policy.form.tsx`: the
  hot-months field calls the preview on change, debounced 300 ms; the row shows "the next run drops
  N partitions, about R rows, B" with a `Callout tone="danger"` when N > 0, and **the save button is
  disabled until a preview for the current value has loaded**. The screen says rows are an estimate
  refreshed by autovacuum. The same read with a cutoff past the runway gives each table its
  "partitions / rows / bytes today" column, `messages` included, read-only (decision 18).
  **Docs:** `platform.md`, `packages/feature/docs/index.md`.
- [ ] `A2.16` **Per-tenant storage** — depends on `S2.11`'s `bytes` and `action_counts`.
  `list-tenant-storage.use-case.ts` (`platform.storage.read`; `partition_archive` grouped by
  `organization_id, table_name`: `sum(bytes)`, `sum(row_count)`, months covered, joined to
  `organizations.name`; sorted by bytes descending; paginated; an optional `organizationId` filter
  that also returns the per-month rows and the per-action breakdown from `action_counts`).
  Procedure `storage.list`, route `/platform/storage`, `tenant-storage.list.tsx` over `DataTable`.
  The screen says **cold storage only**: hot Postgres bytes cannot be attributed to a tenant because
  a partition mixes every tenant's rows, and hot bytes per *table* are on the retention screen
  (`A2.15`). **Docs:** `platform.md`, `cold-storage.md`.
- [ ] `A2.17` **The cold reader, pulled forward from `S5.1`** — the scaling plan's `ColdArchiveReader`
  (`application/src/port/`, `S3ColdArchiveReader` in `infrastructure/src/s3/`) is built here, with
  a bulk method first: `rows(entry: PartitionArchiveEntry): Promise<readonly Readonly<Record<string, unknown>>[]>`
  — `storage.get()` the object, gunzip through `node:zlib` re-exported in `import.ts`, split NDJSON,
  verify sha-256 against `entry.checksum` and length against `entry.rowCount`, and throw
  `ConflictError("cold", "checksum")` otherwise. `S5.1` later adds its paged, user-filtered `list()`
  to the same port; two features adding a method each is what puts the port in `port/`.
  Whole-object, at the ~8 MB tenant-month bound `S5.1` states, with the same 50 MB streaming escape
  hatch. `InMemoryColdArchiveReader` in `composition/src/fake/`, fed by the fake storage gateway.
  **Tripwire:** `test-container.spec.ts` moves to twenty-seven — this port arrives before `S5.1`
  would have added it. `ActivitySubject.of` is lifted to `application/src/primitive/activity-subject.ts`
  and `PgActivityReplayReader` calls it. **Docs:** new `packages/infrastructure/docs/reference/cold-restore.md`
  (registered), `activity-archive.md` gains "reading it back", `ports.md`.
- [ ] `A2.18` **Restore a month, on `S2.13`'s rule** — `S2.13` restores into a **scratch table, never
  the live parent**, because a re-attached month leaves the retention job arguing with itself. This
  action keeps that rule and adds the one case where attaching is right: the month is inside the
  table's hot window. `restore-partition.use-case.ts` (`platform.retention.manage`; input
  `{ tableName, period, organizationId? }`; validates matching `partition_archive` rows exist,
  records `platform.restore.requested` (rebased per decision 9), enqueues `cold-restore` with the
  dedupe `jobId`). `MaintenanceConsumer.restore()`: `S2.13`'s `restore()` per object into the scratch
  table, `cold.partition.restored` per object; then, **only if** the period is at or after the
  cutoff `prune()` would compute from the table's hot months, `maintenance.attachMonthlyPartition(table,
  period, scratch)` — one `alter table … attach partition … for values from … to …`, a new method on
  the existing port, mirrored in `RecordingMaintenanceGateway` — and the month is live again. Outside
  the window the scratch table stays as evidence: nothing sweeps it, on purpose; the next restore of
  the same month replaces it, and the screen says "raise hot months to *N* first to bring it live".
  `outbox_event` restored rows carry `published_at`, so `drain` never re-publishes them, and the item
  says so. Restore panel on `/platform/retention`: table, month, optional tenant → button → `Callout`
  with the job id and which of the two outcomes applies. **Docs:** `cold-restore.md`, `cold-storage.md`
  (`S2.13`'s section gains the attach case), `consumers.md`, `schedules.md`, `ports.md`.
- [ ] `A2.19` **Per-tenant retention override** — the scaling plan's decision 20 makes a tenant's
  month its own partition, so retention can differ per tenant. `tenant_retention_policy
  (organization_id, table_name) primary key, hot_months integer not null, cold_months integer null,
  updated_at` in `platform.schema.ts`; it leads with the tenant, so no §9 exemption.
  `tenant-retention-policy.repository.ts` (`findBy(organizationId, table)`, `forTable(table)`,
  `save`), `pg-tenant-retention-policy.repository.ts`. `update-tenant-retention.use-case.ts`
  (`platform.retention.manage`; `tableName` from `PartitionedTable.NAMES` where `tenantKey` is set;
  write and the `tenant.retention.changed` audit in the transaction). `prune()` resolves, per
  tenant-month, `override ?? retention_policy row ?? allowlist`. Cold months per tenant are
  enforced by the `retention` job's sweep (delete objects and rows older than the tenant's cold
  months), not by the bucket: S3 lifecycle rules match a prefix and are capped at 1,000 per
  bucket, so the per-table rule stays as the ceiling and the app enforces anything shorter.
  `A2.15`'s preview takes an optional `organizationId`. Edited from the tenant row on the shard map
  (`A4.4`) and a tenant panel on `/platform/retention`. Decision 19. **Docs:** `platform.md`,
  `cold-storage.md`, `docs/setup/13` §13.3.
- [ ] `A2.20` **Delete a tenant** — the first tenant deletion in the repository, which is the
  trigger `S2.16` was written without. `delete-organization.use-case.ts` under a new
  `platform.tenant.manage` key (registered in `A1.2`; the seed grants it to `platform_admin`):
  refuses the platform organization itself; archives every tenant-month first (the `S2.14` path
  with the cutoff at now, so nothing is destroyed); `maintenance.dropTenantPartitions
  (organizationId)` for the seven tables; deletes the `organizations` row, whose cascades cover
  the catalog — `api_keys`, `sessions`, `invitations`, `roles`, `role_permissions`, `memberships`,
  `goal_members`, `permission_overrides`, `outbox_event`, with `users.last_active_organization_id`
  set null — and whose seven partitioned referrers are already gone; `capabilities.
  invalidateOrganization` and `shards.invalidate(key)`; `projector.deleteTenant(organizationId)` —
  a ClickHouse lightweight `DELETE FROM activity_events WHERE organization_id = {org:UUID}`, one
  `command()`, so the analytics copy forgets the tenant too rather than keeping them until the
  table's own five-year expiry (`revised: 2026-09-17`; the port gains the method, mirrored in the
  fake, skipped when not configured); audit `tenant.deleted` under the platform organization
  (decision 9). Cold objects stay thirty days: the `retention` job's sweep deletes
  `partition_archive` rows and objects whose organization no longer exists and whose `archived_at`
  is older than that, `cold.objects.swept` with `reason: "tenant_deleted"`. Procedure
  `tenants.delete`, a confirmation that requires typing the slug, on the shard map's tenant row.
  Decision 20. **Docs:** `platform.md`, `cold-storage.md` (`S2.16`'s section gains its trigger),
  `sharding.md`.
- [ ] `A2.21` **Export a tenant** — the design was sold partly on "hand a customer every byte they
  own", and nothing built it. `export-organization.use-case.ts` (`platform.tenant.manage`; records
  `tenant.export_requested`; enqueues `tenant-export` on `MAINTENANCE` with the dedupe `jobId`).
  `MaintenanceConsumer.export()`: for each of the seven tenant-owned tables, stream that tenant's
  rows through the archive gateway's existing per-tenant NDJSON writer (`S2.12`'s `rows()` and
  `putStream`), live rather than detached, into one object per table under
  `export/<organization_id>/<yyyy-mm-dd>/<table>.ndjson.gz`; plus the tenant's catalog rows —
  memberships, roles, role grants, invitations, API keys with their hashes redacted — as an eighth
  object; plus a manifest with row counts and checksums. `cold.tenant.exported` (`info`,
  `{ organizationId, objects, rows, bytes }`). The screen offers a presigned download per object,
  the first caller of `presignDownload`. Objects under `export/` expire by a lifecycle rule after
  seven days, the one prefix rule the app adds beside `cold/` (`A2.5`). Added 2026-09-17.
  **Docs:** `platform.md`, `cold-storage.md`, `storage-policy.md` (the second prefix), `consumers.md`.

**Exit.** With `retention_policy` empty, `pnpm test` and the worker behave exactly as before this
phase. Set `notifications` hot months to 6 on the screen: the audit row lands under the platform
organization, the next `partitions` run prunes to six months. Set `activity_log` cold months to 24:
`aws s3api get-bucket-lifecycle-configuration` against MinIO shows one rule on `cold/activity_log/`
expiring at 731 days, and the screen shows no drift. Set the ClickHouse TTL to 36:
`select engine_full from system.tables where name = 'activity_events'` carries `INTERVAL 36 MONTH`.
Delete the rule from the bucket by hand: the next `retention` run emits `drifted`, then `applied`,
and the rule is back. `pnpm ch:migrate` on an empty ClickHouse creates the table; on a full one it
prints nothing to do. Lower `notifications` hot months on the screen: the preview names the
partitions and the estimate before the save is enabled. Restore last month for the seeded tenant:
the scratch table holds the rows, the count matches `partition_archive`, `cold.partition.restored`
is emitted, and — with hot months raised to cover it — the attach step makes the month live again.
`/platform/storage` lists the seeded tenant with a byte total equal to the object sizes in MinIO.
Set one tenant's hot months to 3: only that tenant's fourth month is archived and dropped on the
next run. Delete the seeded second tenant from the shard map: its seven partitions are gone, its
catalog rows are gone, its cold objects remain and `partition_archive` still names them; thirty days
later (clock-advanced in the spec) the sweep removes them, and its rows are absent from
ClickHouse on the next query. Export the seeded tenant: eight objects and a manifest under
`export/`, every download link works, and the objects are gone after seven days.
`check:architecture` green with one more `TENANT_EXEMPT` line; `test-container.spec.ts` pins
twenty-seven (`A2.5` and `A2.17`).

---

### Phase 3 — Projection policy: which actions reach ClickHouse, and for how long each

**Depends on:** Phase 2 Exit.

**Goal.** Every activity action is a catalog entry; the screen lists them with a projected toggle
and an optional TTL in months; an excluded action is excluded by the replay and by both sides of the
reconciliation; per-action TTLs compose into one expression the default clause does not override;
excluding an action carries the warning that it is permanent past the Postgres retention window.

**Design in one paragraph.** `ACTIVITY_ACTIONS` is merged from per-slice fragments in
`packages/contracts/src/catalog/`, `ActivityAction` is its key union, and `ActivityLogger.record`
takes `ActivityAction` instead of `string`, so the fourteen literals compile against the list and a
fifteenth cannot be written without registering it. `projection_policy (action, projected, ttl_months,
updated_at)`, absent row = projected with the default TTL. `ActivityReplayReader.since` and both
`dailyCounts` take `excluding: readonly ActivityAction[]`; the ClickHouse side sends it as the array
parameter, which is the one interpolated path in the connection and safe here because every element
passed `ActivityActions.isKnown`. `RetentionRules.clickhouseTtlFor` composes one `DELETE WHERE action = '…'`
clause per row with a TTL and a default clause carrying `WHERE action NOT IN (…)` over those same
actions (decision 6). The `retention` job applies it exactly as Phase 2 does. `AnalyticsConsumer`
reads the exclusion list once per run and passes it to all three queries.

- [ ] `A3.1` **The action catalog** — `contracts/src/catalog/<slice>.actions.ts` for `rbac`, `member`,
  `apikey`, `ai`, `platform` (the fourteen existing literals plus `platform.policy.changed`), each
  `{ label }` for the screen, merged into `ACTIVITY_ACTIONS` in `catalog/index.ts`;
  `registry/activity-actions.ts` with `ActivityAction`, `ActivityActions.isKnown`, `.all()`.
  `ActivityLogger.record(actor, action: ActivityAction, payload)` — the compile error at every call
  site is the migration. `set-member-active.use-case.ts:45` emits two actions from one site and
  both are entries. `docs/ai/skills/add-slice.md` step 7 gains "declare the action". **Docs:**
  `docs/opinions/vocabulary.md` (activity names are now a catalog, like domain events, and the two
  are still different vocabularies), `packages/contracts/docs/index.md`.
- [ ] `A3.2` **Schema, port, adapter** — `projection_policy` in `platform.schema.ts`, `TENANT_EXEMPT`
  line with the comment (the projection is cross-tenant by construction),
  `projection-policy.repository.ts` (`all()`, `save(row)`), `pg-projection-policy.repository.ts`.
  **Docs:** `docs/setup/13` §13.3, `docs/setup/26` §9.
- [ ] `A3.3` **Three queries, one list** — `ActivityReplayReader.since(checkpoint, limit, excluding)`
  and `dailyCounts(from, to, excluding)`; `AnalyticsProjector.dailyCounts(from, to, excluding)`.
  `AnalyticsConsumer.project()` and `reconcile()` read `projectionPolicies.all()` once and pass the
  excluded actions to every call. Integration spec: exclude one action, insert rows of two actions,
  project, reconcile — zero drift, and the excluded action's rows are absent from ClickHouse.
  **Docs:** `clickhouse.md` reconciliation section, `consumers.md`.
- [ ] `A3.4` **Per-action TTL composition** — `RetentionRules.clickhouseTtlFor(defaultMonths, perAction)`
  produces `toDateTime(occurred_at) + INTERVAL a MONTH DELETE WHERE action = 'x', …, toDateTime(occurred_at) + INTERVAL d MONTH DELETE WHERE action NOT IN ('x', …)`;
  unit spec pins the expression for zero, one and three per-action rows, and a case proving that
  without the `NOT IN` a longer per-action TTL is deleted by the default clause (run against the
  live container under `pnpm smoke`, because only ClickHouse can prove it). `retention()` normalises
  whitespace and quoting before comparing. **Docs:** `clickhouse.md`.
- [ ] `A3.5` **Use-cases, contract, router, container** — `list-projection-policies` (`platform.analytics.read`;
  every catalog action joined to its row or the default) and `update-projection-policy`
  (`platform.analytics.manage`; `action` validated by `ActivityActions.isKnown`; write + audit in the
  transaction; `applyRetention` after it). `projection.list` / `projection.update` procedures, the
  permission entries, the router, `container.platform` grows two. **Docs:** `platform.md`.
- [ ] `A3.6` **The screen** — `projection-policy.form.tsx`: one row per action, grouped by the
  action's slice, a projected toggle and a months field; a `Callout tone="danger"` when a toggle goes
  off: rows already in ClickHouse stay, new rows stop, and after the Postgres retention window the
  gap cannot be replayed except from cold storage. Route `platform/analytics.tsx`, copy in both
  locales. **Docs:** `packages/feature/docs/index.md`.
- [ ] `A3.7` **Docs** — `clickhouse.md` §"What is not wired" rewritten: the policy is wired, the
  read driver still is not; `docs/opinions/data-and-scale.md` "On ClickHouse specifically" gains one
  sentence on the policy rows; `DB-SCALING-DEFERRED.md` `S5.6` marked moved here.
- [ ] `A3.8` **`platform_policy` and the switch** — `platform.schema.ts`: `platform_policy (id smallint
  primary key check (id = 1), projection_enabled boolean not null default true,
  replica_reads_enabled boolean not null default false, updated_at)`; a `TENANT_EXEMPT` line with
  the comment (a deployment-wide switch has no tenant). `platform-policy.repository.ts` (`get()` →
  the row or the defaults, `save(row)`), `pg-platform-policy.repository.ts`.
  `toggle-projection.use-case.ts` (`platform.analytics.manage`; refuses with
  `ConflictError("analytics", "not_configured")` when `health().analytics === null`; the write and
  the `platform.projection.paused` / `platform.projection.resumed` audit in the transaction).
  Procedures `policy.get`, `policy.updateProjection`. Screen: a three-state control at the top of
  `/platform/analytics` — "Not configured" (disabled, naming `CLICKHOUSE_URL`), "On", "Off" — and on
  "Off" a `Callout tone="danger"` with the deadline: rows stop being projected now; the audit table
  keeps *N* months (from the retention row); re-enable within that or fill the gap from cold storage
  (`A3.10`). Decision 12: a pause, not a power switch. **Docs:** `platform.md`, `clickhouse.md`,
  `docs/setup/13` §13.3, `docs/setup/26` §9.
- [ ] `A3.9` **The consumer honours it** — `AnalyticsConsumer.project()` and `reconcile()` read
  `platformPolicy.get()` first and return when off: no batches, no lag computation, no drift
  comparison, and no log line — 288 lines a day is noise, and the status page shows the state. The
  `retention` job's `applyRetention` still runs when off: the connection exists, and a TTL edit is
  not a projection. Resume needs nothing, because the checkpoint is read from ClickHouse.
  Integration spec: off → insert rows → run → ClickHouse unchanged and no `lagged` line; on → run →
  the rows land. **Docs:** `consumers.md`.
- [ ] `A3.10` **Re-project from cold storage** — `reproject-partition.use-case.ts`
  (`platform.analytics.manage`; input `{ period, organizationId? }`, `activity_log` only; refuses
  when not configured; records `platform.reproject.requested`; enqueues `cold-reproject` on
  `MAINTENANCE` with `jobId: "cold-reproject:activity_log:<period>:<org|all>"`, so a double click is
  one job). `AnalyticsConsumer.reproject()` — it owns the projector: for each `partition_archive`
  row for that period (and tenant, if given): `coldArchive.read(entry)` (`S2.13`'s reader) → map to
  `ActivityRecord` with `ActivitySubject.of` → drop excluded actions (`A3.3`'s list) →
  `projector.project` in batches of 5,000 → stamp `projected_at` →
  `cold.partition.reprojected { period, organizationId, rows }`. Idempotent through
  `ReplacingMergeTree`. Screen: a **Gaps** panel on `/platform/analytics` listing periods with any
  `projected_at is null` row (the partial index from `S2.11`), tenant counts, and a re-project
  button per period; the reason on the `analytics.projection.gap` line is not stored, so the panel
  shows only that a gap exists. **Docs:** `cold-restore.md`, `clickhouse.md`, `consumers.md`.
- [ ] `A3.11` **Reconcile covers the cold window** — `reconcile()` also compares, for each archived
  period of `activity_log`, `sum(partition_archive.row_count)` minus the excluded actions' counts
  from `action_counts` against ClickHouse's `dailyCounts` summed over that month; drift emits
  `analytics.reconciliation.drifted` with `source: "cold"`. A period with any `projected_at is null`
  row is skipped: a known gap is not drift. Closes the promise at `analytics.schema.ts:8-9`, which
  names a check nothing ever ran. **Docs:** `clickhouse.md` reconciliation section.

**Exit.** Toggle `ai.document.searched` off: the next projection writes none, the next reconcile
reports zero drift, and the screen shows the warning. Give `member.invited` a 12-month TTL with
the default at 60: `engine_full` carries both clauses and the `NOT IN`. Add a fifteenth
`activity.record` call with an unregistered string: typecheck fails. Switch the projection off,
insert rows, wait a run: ClickHouse unchanged and no `lagged` line; switch it on: the rows land.
Pause it and let a month prune: `partition_archive.projected_at` is null for that month and
`analytics.projection.gap` was emitted with `reason: "disabled"`; re-project it from the Gaps
panel: the rows land, `projected_at` is stamped, and the next reconcile reports no cold drift.
`check:architecture` green with three `TENANT_EXEMPT` lines from this plan.

---

### Phase 4 — The replica panel and the shard map (built after the scaling plan's Phase 3 and 4)

**Depends on:** `DB-SCALING-PLAN.md` Phase 3 for the map (`S3.3`, `S3.5`); `S4.2` for the move
button's procedure; `S4.4` for the replica handle and `cluster.reader(key)`.

- [ ] `A4.1` **Status** — `InspectPlatformStatusUseCase` grows `replica: { healthy, lagSeconds } | null`
  from the cluster's replica handle (`now() - pg_last_xact_replay_timestamp()`), rendered on
  `/platform/status`. Nothing to switch yet.
- [ ] `A4.2` **The switch** — `platform_policy.replica_reads_enabled` (decision 14; the column is
  created in `A3.8` and read by nothing until here), `toggle-replica-reads.use-case.ts` under a
  `platform.replica.manage` key registered with `S4.4`, which is also what decides what reads route
  there (worker batch reads first, web never in the first cut). Until then a switch would switch
  nothing, so the use-case and the control land with `S4.4`.
- [ ] `A4.3` **Colder storage class** — a `transitionAfterDays` and storage class on `LifecycleRule`,
  once someone pays for Glacier; MinIO needs a configured tier to honour it, which is why it is not
  in Phase 2.
- [ ] `A4.4` **The shard map** — `inspect-shard-map.use-case.ts` (`platform.shards.read`): one row per
  physical node — tenant count from `shard_assignments` grouped by `node`, most recent `assigned_at`
  — with the tenants of a node on expand, paginated, each tenant row carrying its retention override
  (`A2.19`), the move button (`A4.5`) and the delete action (`A2.20`); plus a tenant lookup
  (organization id or slug → its node). `revised: 2026-09-16` — the shard is the organization. The output
  carries `moves: "unavailable" | "available"` from `container.hasShardMoves`, a getter that is a
  constant `false` with the comment until `S4.2` registers the move job; the seam earns its place
  because the retrofit touches contract, screen and use-case (decision 17). Procedure `shards.map`,
  route `/platform/shards`, `shard-map.panel.tsx`. **Docs:** `platform.md`, `sharding.md` (from `S3.21`).
- [ ] `A4.5` **The move button** — rendered on every tenant row; disabled with the copy "tenant moves
  need the physical split; scaling plan Phase 4" while `moves === "unavailable"`.
  `move-tenant.use-case.ts` (`platform.shards.manage`; input `{ organizationId, toNode }`;
  records `platform.tenant.move_requested`; enqueues `S4.2`'s job) and the `shards.move` procedure
  **land with `S4.2`**, in that commit, and flip `hasShardMoves`. **Docs:** `sharding.md`.

**Exit (the built part).** `/platform/shards` renders one row for node 0 on the single-node compose
stack with the seeded tenants underneath, the move button disabled with its reason; the tenant lookup
finds the seeded organization.

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 20/20 today; +0 assertions from this plan, +2 TENANT_EXEMPT lines
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up:analytics && pnpm db:migrate && pnpm db:seed && pnpm ch:migrate
pnpm platform:grant alice@example.test
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
# second pass: the restore and re-project round trips run under `pnpm smoke` against MinIO and ClickHouse
```

Then by hand, per phase Exit line. The one check that cannot be automated: **sign in as a tenant
owner who is not a platform admin and type `/platform/retention` into the address bar** — the
redirect to `/forbidden` is the tier working, and every other surface can hide a link.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-14 | @sami | Created. Un-defers `S2.15` and `S5.6` from `DB-SCALING-DEFERRED.md` into a platform tier built on RBAC (a platform organization, a third scope, a seeded role, a grant script), a retention slice covering Postgres hot months, cold months and mode, the bucket lifecycle the app now owns, and the ClickHouse TTL, a projection-policy slice over a new activity-action catalog with per-action inclusion and TTL, and a replica panel filed behind `S4.4`. Two findings shaped it: `StorageGateway` disclaims bucket-level concerns in its own header, so lifecycle is a second port; and activity actions are fourteen free-form literals with no list, so per-action policy needs a catalog first, in `contracts`, because the screen must list it |
| 2026-09-15 | @sami | **Second pass: what the admin could not yet do.** Decisions 12–18. The projection switch (a pause, not a power switch; three states; off pauses both alarms) on a single-row `platform_policy` that also homes the replica switch (`A3.8`, `A3.9`, `A4.2`); a projection gap is recorded on `partition_archive.projected_at` and filled by a re-project action reading cold storage through the worker (`A3.10`); the reconcile finally covers the cold window (`A3.11`); a preview before every retention change (`A2.15`); per-tenant cold storage (`A2.16`); a restore action built on the scaling plan's scratch-table restore with a live attach only inside the hot window (`A2.17`, `A2.18`); a shard map now and a move button that waits on `S4.2` (`A4.4`, `A4.5`). `messages` partitioning and the partition-estimate read went to the scaling plan (`S2.6`, `S2.19`). Queue-job retention checked and already capped, not filed |
| 2026-09-16 | @sami | **Third pass, following the scaling plan's tenant layout.** Decisions 19 and 20. Per-tenant retention as an override row with the table default as fallback, hot months exact and cold months app-enforced (`A2.19`); tenant deletion as a platform action under `platform.tenant.manage` — archive first, drop seven partitions, cascade the catalog, keep cold objects thirty days (`A2.20`); the shard map is one row per node with tenants underneath and the move button targets a node (`A4.4`, `A4.5`); nine permission keys |
| 2026-09-16 | @sami | Same day, second row: decision 21 draws the line between what is a file and what is a screen, and a new section lists every control on each side plus the constants that stay constants on purpose. The scaling plan's `S2.25` generator is what makes the file side one line |
| 2026-09-17 | @sami | Two improvements from a review. Tenant deletion (`A2.20`) now issues a ClickHouse lightweight delete, so a deleted customer is not kept in the analytics copy for five years. New `A2.21` exports a tenant — seven tables live through the archive writer, the catalog rows as an eighth object, a manifest, presigned downloads, a seven-day expiry under `export/` — which closes a promise the design made and no item kept |

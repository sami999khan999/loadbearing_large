---
title: Platform admin plan — the tier, retention, projection policy, the replica panel
updated: 2026-09-14
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

---

## The phases

### Vocabulary fixed up front

| Thing | Name |
|---|---|
| Scope | `platform`, on `PermissionScope` and on `roles.scope` |
| Column | `organizations.is_platform boolean not null default false`, `organizations_platform_uq` partial on `(is_platform) where is_platform` |
| System role (platform org only) | `platform_admin`, `is_system`, `scope = 'platform'`, every `platform.*` key |
| Permission keys (`packages/permissions/src/catalog/platform.permissions.ts`, module `platform`, scope `platform`) | `platform.status.read`, `platform.retention.read`, `platform.retention.manage`, `platform.analytics.read`, `platform.analytics.manage` |
| Routes (`route/platform.routes.ts`) | `/platform/status`, `/platform/retention`, `/platform/analytics` |
| Gate (`gate/platform.gate.ts`) | `platform: { permission: "platform.status.read", route: ROUTES.platform.status }` |
| Tables (catalog, tenant-exempt) | `retention_policy (store, table_name) pk`, `projection_policy (action) pk` |
| Action catalog (`packages/contracts/src/catalog/`) | `<slice>.actions.ts` fragments → `ACTIVITY_ACTIONS`; `ActivityAction`, `ActivityActions.isKnown` in `registry/` |
| Application slice `platform/` | `retention-policy.repository.ts`, `projection-policy.repository.ts`, `platform.reader.ts` (ports); `retention.rules.ts`; `list-retention-policies`, `update-retention-policy`, `list-projection-policies`, `update-projection-policy`, `inspect-platform-status` use-cases |
| Cross-cutting port | `application/src/port/storage-policy.gateway.ts` → `StoragePolicyGateway { lifecycle(), applyLifecycle(rules) }`, `LifecycleRule { prefix, expireAfterDays }` |
| Infrastructure | `pg/schema/platform.schema.ts`, `pg/repository/pg-retention-policy.repository.ts`, `pg-projection-policy.repository.ts`, `pg-platform.reader.ts`, `pg/seed/platform-role.seed.ts`, `s3/s3-storage-policy.gateway.ts`; scripts above `src/`: `platform-grant.ts`, `clickhouse-migrate.ts`, `clickhouse-migrations/` |
| Cache prefix | `capability:platform:<userId>`, 60 s, `invalidatePlatform()` on the invalidator |
| Content namespace | `platform` |
| Query keys | `QueryKeys.platform.status()`, `.retention()`, `.projection()` |
| Worker job | `retention` on `QueueName.MAINTENANCE`, daily at 03:30, `RetentionSchedule` |
| Log event codes | `retention.lifecycle.applied` (info), `retention.lifecycle.drifted` (warn), `retention.rows.expired` (info), `analytics.retention.applied` (info). `platform.policy.changed` is an **activity**, not a log code |
| Scripts | `pnpm platform:grant <email>`, `pnpm ch:migrate` |
| Docs pages (new) | `packages/permissions/docs/reference/platform-scope.md`, `packages/application/docs/reference/platform.md`, `packages/infrastructure/docs/reference/clickhouse-migrations.md`, `packages/infrastructure/docs/reference/storage-policy.md` |

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
- [ ] `A1.2` **Keys, routes, gate** — `catalog/platform.permissions.ts` with the five keys from the
  vocabulary, spread into `CATALOG`; `route/platform.routes.ts`; `gate/platform.gate.ts` gating the
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
  in the content nav list. **Docs:** `apps/web/docs/reference/enforcement-surfaces.md` gains nothing
  new, `packages/content/docs/reference/namespace.md`.
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

**Exit.** With `retention_policy` empty, `pnpm test` and the worker behave exactly as before this
phase. Set `notifications` hot months to 6 on the screen: the audit row lands under the platform
organization, the next `partitions` run prunes to six months. Set `activity_log` cold months to 24:
`aws s3api get-bucket-lifecycle-configuration` against MinIO shows one rule on `cold/activity_log/`
expiring at 731 days, and the screen shows no drift. Set the ClickHouse TTL to 36:
`select engine_full from system.tables where name = 'activity_events'` carries `INTERVAL 36 MONTH`.
Delete the rule from the bucket by hand: the next `retention` run emits `drifted`, then `applied`,
and the rule is back. `pnpm ch:migrate` on an empty ClickHouse creates the table; on a full one it
prints nothing to do. `check:architecture` green with one more `TENANT_EXEMPT` line;
`test-container.spec.ts` pins twenty-six.

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

**Exit.** Toggle `ai.document.searched` off: the next projection writes none, the next reconcile
reports zero drift, and the screen shows the warning. Give `member.invited` a 12-month TTL with
the default at 60: `engine_full` carries both clauses and the `NOT IN`. Add a fifteenth
`activity.record` call with an unregistered string: typecheck fails. `check:architecture` green
with two `TENANT_EXEMPT` lines from this plan.

---

### Phase 4 — The replica panel (filed, not built)

**Depends on:** `DB-SCALING-PLAN.md` Phase 3 (the cluster) and `S4.4` (the replica handle and
`cluster.reader(key)`).

- [ ] `A4.1` **Status** — `InspectPlatformStatusUseCase` grows `replica: { healthy, lagSeconds } | null`
  from the cluster's replica handle (`now() - pg_last_xact_replay_timestamp()`), rendered on
  `/platform/status`. Nothing to switch yet.
- [ ] `A4.2` **The switch** — a `replica_reads_enabled` boolean, home decided when `S4.4` decides what
  reads route there (worker batch reads first, web never in the first cut). Until then a switch
  would switch nothing.
- [ ] `A4.3` **Colder storage class** — a `transitionAfterDays` and storage class on `LifecycleRule`,
  once someone pays for Glacier; MinIO needs a configured tier to honour it, which is why it is not
  in Phase 2.

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 20/20 today; +0 assertions from this plan, +2 TENANT_EXEMPT lines
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up:analytics && pnpm db:migrate && pnpm db:seed && pnpm ch:migrate
pnpm platform:grant alice@example.test
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
```

Then by hand, per phase Exit line. The one check that cannot be automated: **sign in as a tenant
owner who is not a platform admin and type `/platform/retention` into the address bar** — the
redirect to `/forbidden` is the tier working, and every other surface can hide a link.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-14 | @sami | Created. Un-defers `S2.15` and `S5.6` from `DB-SCALING-DEFERRED.md` into a platform tier built on RBAC (a platform organization, a third scope, a seeded role, a grant script), a retention slice covering Postgres hot months, cold months and mode, the bucket lifecycle the app now owns, and the ClickHouse TTL, a projection-policy slice over a new activity-action catalog with per-action inclusion and TTL, and a replica panel filed behind `S4.4`. Two findings shaped it: `StorageGateway` disclaims bucket-level concerns in its own header, so lifecycle is a second port; and activity actions are fourteen free-form literals with no list, so per-action policy needs a catalog first, in `contracts`, because the screen must list it |

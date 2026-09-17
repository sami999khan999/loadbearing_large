---
title: Database scaling — deferred work
updated: 2026-09-14
owner: sami
schema: plan/v1
source: split from DB-SCALING-PLAN.md at 5777eba, 2026-09-14
---

# Database scaling — deferred work

> **How to use this file**
>
> 1. Every item keeps the ID it had in [`DB-SCALING-PLAN.md`](DB-SCALING-PLAN.md). Nothing is renumbered
>    here or there.
> 2. An item leaves this file by being moved back into the plan under its own ID when its
>    **Reopen when** line is true. It is never built from here.
> 3. Phase 4 of the plan is also filed rather than built. It stays in the plan because `T-037` and two
>    docs pages cite it by that name.

## Items

- [-] `S2.15` **Retention as data, not as a deploy** — global
  `retention_policy (table_name text primary key, hot_months integer not null, updated_at)`, read
  by the consumer on every run, **absent row = the allowlist value**. That last clause is the whole
  design, borrowed from `notification_preferences`: an empty table behaves exactly like today, so
  the migration changes no behaviour and the first edit is the first change.
  Global, so it needs a `TENANT_EXEMPT` entry in `check-architecture` §9 carrying a comment that
  says *why*: a partition spans every tenant, so a per-tenant retention row would be describing
  something the storage engine cannot do (`DB-SCALING-PLAN.md` 2.C, second finding).
  `PartitionedTableEntry.retentionMonths` becomes the fallback. **Docs:** `cold-storage.md`,
  `docs/ai/rules/data.md`.
  **Deferred 2026-09-14, decision 14.** Until a platform tier exists the row has no editor but
  SQL, and a SQL edit and an allowlist edit plus a deploy are the same operation with a review
  attached to the second. **Reopen when** `S5.6` is built.
  `moved: 2026-09-14` — reopened the same day, as `A2.3`–`A2.7` in
  [`PLATFORM-ADMIN-PLAN.md`](PLATFORM-ADMIN-PLAN.md), with two more columns (cold months, cold
  mode) and a `store` column so the ClickHouse TTL is a row in the same table.

- [-] `S5.6` **The platform tier and the retention dashboard** — the editor this work was asked
  for cannot be written today, and the reason is worth recording rather than discovering twice.
  Retention is global (`DB-SCALING-PLAN.md` 2.C, second finding), and this repo has no
  authorization tier above an organization: `PermissionScope` is `"org" | "goal"`,
  `CapabilitySet` is always resolved *for* one tenant and never consults an organization id, and
  `SystemPrincipal.platform()` deliberately holds nothing at all.
  What the dashboard needs, in order: a `"platform"` scope on `PermissionScope`, a capability that
  can be held outside any tenant, and a way to grant it — **an env-listed user id is the right
  first cut**, not a new table, because the alternative is a bootstrapping problem about who may
  edit the table of who may edit things. This is the same tier the super-admin dashboard in
  `docs/opinions/data-and-scale.md` already assumes for reading Loki, so it is worth building once
  and deliberately rather than smuggling a global setting in under an org permission — which would
  mean any owner of any tenant could change every tenant's retention.
  Until it lands, retention is changed on the allowlist entry and deployed.
  **Deferred 2026-09-14, decision 14.** **Reopen when** the super-admin Loki reader in
  `docs/opinions/data-and-scale.md` §1 is scheduled, or an operator asks to change retention
  without a deploy. The tier is built once, for both.
  `moved: 2026-09-14` — reopened the same day, as Phase 1 of
  [`PLATFORM-ADMIN-PLAN.md`](PLATFORM-ADMIN-PLAN.md). One thing changed on the way: the grant is
  **not** an env-listed user id. It rides RBAC — a platform organization, a third scope, a seeded
  `platform_admin` role, and `pnpm platform:grant` for the first holder.

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-14 | @sami | Created. `S2.15` and `S5.6` moved here from `DB-SCALING-PLAN.md` by decision 14, IDs kept |
| 2026-09-14 | @sami | Both items reopened the same day by `PLATFORM-ADMIN-PLAN.md`; marked moved, bodies kept as the record. The file stays for the next deferral |

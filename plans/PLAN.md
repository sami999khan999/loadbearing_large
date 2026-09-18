---
title: The plan — the whole project, in the order it was and will be built
updated: 2026-09-17
owner: sami
schema: plan/v2
source: rewritten 2026-09-17 from plans/PLAN.md and plans/archive/* at 1a302f8; phases renumbered 1–26 in build order
---

# The plan

> **How to use this file**
>
> 1. **One numbering.** A phase is `Phase <n>`, an item is `<phase>.<item>`, a decision is `D<n>`.
>    Numbers are never reused or moved: a new item takes the next free number in its phase, a new
>    phase goes on the end. An old-style ID (`S2.5`, `A1.10`, `C6.3`, `P8.3`, `decision S-13`) from
>    `archive/` or from a doc page is looked up in **Where the old IDs went** at the bottom.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress · `[!]` blocked ·
>    `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing. Nothing is deleted.
> 3. **File order is build order.** Phases 1–15 are built and read as history; 16 onward is the
>    queue. A phase that may run beside another says so in its first line; a dependency on another
>    phase is stated on the phase that has it.
> 4. Built items are one line each. Their full text — `verified:` and `corrected:` notes, the
>    measurements — is in `archive/` under the old ID, untouched.
> 5. Every item that touches code lists the doc it must update. A code change with the doc untouched is
>    not done. `docs/opinions/` wins over `docs/ai/rules/`.
> 6. `TODO.md` is history: its `T-036`, `T-037` and `T-038` are the ledger rows for the communication,
>    scaling and admin phases here, and everything else in it is closed or moved to Phase 23.
> 7. Commit per layer with the closed `scope-enum`. No author or tool trailers.

---

## Where we are

**State, 2026-09-17.** Fifteen phases are built: the implementation audit (1–8, 5–6 September),
the communication stack (9–13, 12–13 September), connection pooling and the partition allowlist
(14–15, 13 and 17 September). Eleven are open. Of the 131 open items, 23 are filed by decision rather
than queued — Phases 24, 25 and 26 — so the build queue proper is 108 items across Phases 16–23.

**The first thing to do is not an item.** `pnpm infra:up` has to be running before any spec that
needs a database does — and on a clean clone, `pnpm install` then `pnpm build:packages` before
`pnpm typecheck`, because `route-tree.gen.ts` is generated and gitignored.
`corrected: 2026-09-18` — the port clash this line described is gone; 5432 and 6432 were both free.

**`16.1` and the merge unit after it are built** (2026-09-18): the pruning spec, the two-level
tenant layout, its seed, the two-level maintenance gateway and the per-tenant projection, plus
`16.7` through `16.11`. **Start at `16.12`** — the tenant ceiling, measured — then `16.13`, then 17,
then 19 on top of it. Phase 18 touches permissions, auth
and composition only and can run beside all of that. Phase 23 is independent small work for any
spare hour.

### Timeline

| Phase | What | Stream | Status | When | Was |
|---|---|---|---|---|---|
| 1 | Comment reduction and its guard rail | Implementation | ✅ done | 2026-09-05 | `IMPLEMENTATION-PLAN.md` Phase 1 |
| 2 | Bugs | Implementation | ✅ done | 2026-09-05 | `IMPLEMENTATION-PLAN.md` Phase 2 |
| 3 | Convention and pattern clean-up | Implementation | ✅ done | 2026-09-05 | `IMPLEMENTATION-PLAN.md` Phase 3 |
| 4 | Docs drift already present | Implementation | ✅ done | 2026-09-06 | `IMPLEMENTATION-PLAN.md` Phase 4 |
| 5 | Feature gaps: close or cut | Implementation | ✅ done | 2026-09-06 | `IMPLEMENTATION-PLAN.md` Phase 5 |
| 6 | Tests for what is risky and untested | Implementation | ✅ done | 2026-09-06 | `IMPLEMENTATION-PLAN.md` Phase 6 |
| 7 | Improvements | Implementation | ✅ done | 2026-09-06 | `IMPLEMENTATION-PLAN.md` Phase 7 |
| 8 | Worker, tooling, CI, infra, migrations | Implementation | ✅ done | 2026-09-05 → 06 | `IMPLEMENTATION-PLAN.md` Phase 8 |
| 9 | Unified mail pipeline | Communication | ✅ done | 2026-09-12 | `COMMUNICATION-PLAN.md` Phase 1 |
| 10 | Transactional outbox | Communication | ✅ done | 2026-09-12 | `COMMUNICATION-PLAN.md` Phase 2 |
| 11 | Notifications: inbox, email, preferences, digest | Communication | ✅ done | 2026-09-12 | `COMMUNICATION-PLAN.md` Phase 3 |
| 12 | Real-time delivery: SSE over oRPC, Redis fan-out | Communication | ✅ done | 2026-09-12 → 13 | `COMMUNICATION-PLAN.md` Phase 4 |
| 13 | Messaging: conversations and messages | Communication | ✅ done | 2026-09-13 | `COMMUNICATION-PLAN.md` Phase 5 |
| 14 | Connection pooling: the pool you can see, and the pooler in front of it | Scaling | ✅ done | 2026-09-13 | `DB-SCALING-PLAN.md` Phase 1 |
| 15 | Partition policy on the allowlist | Scaling | ✅ done | 2026-09-13 → 17 | `DB-SCALING-PLAN.md` 2.A and `S2.4` |
| 16 | Pruning proven, and the tenant layout | Scaling | 🟨 part | in progress — 16.1–16.11 done | `DB-SCALING-PLAN.md` 2.B |
| 17 | Cold storage: retention stops meaning deletion | Scaling | ⬜ open | after 16 | `DB-SCALING-PLAN.md` 2.C |
| 18 | The platform tier, on RBAC | Admin | ⬜ open | any time — no gate | `PLATFORM-ADMIN-PLAN.md` Phase 1 |
| 19 | Retention: hot months, cold months, cold mode, and the ClickHouse TTL | Admin | ⬜ open | after 17 and 18 | `PLATFORM-ADMIN-PLAN.md` Phase 2 |
| 20 | Projection policy: which actions reach ClickHouse, and for how long each | Admin | ⬜ open | after 19 | `PLATFORM-ADMIN-PLAN.md` Phase 3 |
| 21 | Archived data, where the person it belongs to can read it | Scaling | ⬜ open | any time after 17 | `DB-SCALING-PLAN.md` Phase 5 |
| 22 | Virtual sharding: the seam, verified on one node | Scaling | ⬜ open | after 17 | `DB-SCALING-PLAN.md` Phase 3 |
| 23 | Loose ends — no gate, any spare hour | All | ⬜ open | any time | `P8.3`, `C2.10`, `C2.11`, `C4.10`, `T-033`–`T-035`, eight Exit clauses |
| 24 | The physical split | Scaling | 📁 filed | when a second node is needed | `DB-SCALING-PLAN.md` Phase 4 |
| 25 | The replica panel and the shard map | Admin | 📁 filed | after 22 and 24 | `PLATFORM-ADMIN-PLAN.md` Phase 4 |
| 26 | Communication follow-ups | Communication | 📁 filed | when a trigger fires | `COMMUNICATION-PLAN.md` Phase 6 |

### Running it again

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 21/21 today; 23 after Phase 22; no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up:analytics && pnpm db:migrate && pnpm db:seed     # plus `pnpm ch:migrate` and `pnpm platform:grant` once 19.1 and 18.10 exist
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
```

---

## Decisions (do not re-litigate)

Fifty decisions, numbered once. The grouping is the stream each was taken in and the order is the
order they were taken; a later decision that reverses an earlier one says so on both. Each ends
with the ID the archive cites it by.

### Communication — D1 to D9 (2026-09-12)

D1. **Every mail is queued**, auth mail included. The Better Auth hooks enqueue and return; the
   worker renders and sends. Consequence stated in the plan: in development the worker must be
   running for a verification link or OTP to arrive, and a stalled worker delays sign-up mail.
   Mitigation: auth mail is published at high priority with five attempts, and BullMQ's own
   exponential backoff carries the retry. *(was C-1)*
D2. **Channels: in-app + email with per-user, per-category preferences** (immediate / daily
   digest / off). Web push is a documented port, not built. *(was C-2)*
D3. **Messaging: conversations** — direct messages and group channels inside an organization,
   messages with edit/delete, read receipts, unread counts, typing indicators. Threads,
   reactions and attachments are listed as follow-up items, not built. *(was C-3)*
D4. **Real-time over SSE using oRPC event iterators** through the existing `/api/rpc` route, with
   Redis pub/sub fan-out across web replicas behind a port. No `ws`, no socket.io. *(was C-4)*
D5. **Build the transactional outbox (T-031) now** as the event spine; notifications are its
   first subscriber. *(was C-5)*
D6. **"Design for 100k DAU"** — read as: every table, key and port is shaped so the moves in
   `docs/opinions/data-and-scale.md` §8 are adapter swaps (month partitions from the first
   migration, keyset pagination everywhere, one Redis subscriber per web replica demuxed
   in-process, channel names that lead with the organization id so sharded pub/sub or Redis
   Streams can replace plain pub/sub, idempotent consumers keyed on a stable event id, unread
   counters cacheable in Redis with Postgres as truth, retention jobs from day one). It does
   **not** mean running Kafka, Redis Cluster or sharded Postgres in the compose stack — the
   repo's own rule (`simplicity.md`, `data.md` "do not build in advance") stands, and the plan
   says so where it matters. *(was C-6)*
D7. **Hand-written HTML and CSS templates, and no new package.** They are plain strings, so the
   one thing a separate package bought — a home for React in a graph whose copy and domain
   packages are React-free — is not needed. They live in `packages/composition/src/mail/`, beside
   the two mailers that already join translated copy to the transport and already build the
   plain-text body by hand. Mail clients need inline CSS and table layouts whatever you author
   in, which is most of what a component library compiles down to. *(was C-7)*
D8. **No mail table. A send is a queue job and nothing else.** The queue carries the work, the
   database carries only what must be transactional, and at scale the mail provider carries the
   delivery record — a dedicated mail log is something apps add for a stated reason (regulated
   retention, an in-app resend history, a provider whose log expires too soon), not a default.
   BullMQ here already supplies retries, exponential backoff and duplicate suppression by job id,
   which is what a `status`/`attempts` table would re-implement. It also keeps the plaintext
   invitation token out of Postgres, which is the whole point of storing only its hash.
   The crash window between a commit and its enqueue is covered by a resend action, not a row.
   **The outbox event table is the deliberate exception** and stays: Redis cannot commit
   atomically with Postgres, so an event published from Redis can fire for a change that rolled
   back, or vanish if the process dies in between. That is the one place the write is
   load-bearing. *(was C-8)*
D9. **Order:** mail → outbox → notifications → real-time → messaging. Each phase is mergeable
   on its own.

--- *(was C-9)*

### Scaling — D10 to D29 (2026-09-13 to 16)

D10. **The routing key is a `ShardKey` the strategy derives; the default strategy derives it from
   `organization_id`.** Nothing else is on every table, so nothing else can route a query. A fork
   that needs a different key (store, workspace, region) writes one `ShardingStrategy` in
   `packages/composition/src/shard/` and adds its key column to its own tables. Use-cases never
   see any of it (`data-and-scale.md` §7 holds). *(was S-1)*
D11. **256 virtual shards, fixed forever.** `VirtualShard.COUNT` is a constant nobody edits: the
   directory makes changing it unnecessary, and changing it would re-place every key.
   `reversed: 2026-09-16 — decision D28.` *(was S-2)*
D12. **Placement is a directory row, not a hash.** `shard_assignments (shard_key, virtual_shard)`
   on the catalog, written once per key by the `ShardPlacementPolicy` the container binds
   (default `HashShardPlacementPolicy`: FNV-1a over the key, even spread, no state). Moving one
   tenant is rewriting one row; moving a virtual shard is editing one env entry. A key with no
   row is an `InternalError` — the backfill migration and the founder together mean it cannot
   happen, and a lazy insert on the read path would hide the case where it did.
   `revised: 2026-09-16` — the row is `(shard_key, node)`; there is no hash, no policy port and no
   env range: every new tenant lands on node 0 until the physical split, and the split (`24.1`) is
   where a placement policy earns its place. The last sentence stands: a key with no row is an
   `InternalError`. *(was S-3)*
D13. **Physical shard 0 is the catalog and always exists.** It is `DATABASE_URL`. Every physical
   shard carries the full schema (one migration set, looped), so catalog tables exist empty on
   shards 1+; that is harmless and is what keeps `migrate.ts` a loop rather than a branch. *(was S-4)*
D14. **Three placements, and every table has exactly one.** `catalog` — the tables a principal is
   built from before a key is known, plus RBAC and the two tenant-less lookups: `users`,
   `accounts`, `sessions`, `verifications`, `two_factors`, `organizations`, `memberships`,
   `roles`, `role_permissions`, `goal_members`, `permission_overrides`, `invitations`, `api_keys`,
   `shard_assignments`, `activity_archive` (until its drop migration), and `partition_archive`
   (`17.2`) — a read starts there before any shard is known, `17.6`'s sweep reads one place, and
   the per-shard archive loop writes its rows as standalone inserts outside any routed transaction,
   which decision D15 permits. `local` — present on every physical database and
   written in whichever transaction is open: `activity_log`, `outbox_event`. `routed` — everything
   a tenant produces: `notifications`, `notification_preferences`, `conversations`,
   `conversation_members`, `messages`, `document_chunks`, and every future slice. Those three
   lists cover all twenty-two tables in `pg/schema/` exactly once today, and twenty-four once
   `17.2` and `22.3` land, with nothing left over.
   `local` has three writers beyond the two that insert into it, and each is already looped per
   shard by `22.16`: `PgOutboxGateway.drain` (`update outbox_event set published_at`),
   `PgActivityArchiveGateway` (detach, attach, drop on `activity_log`) and
   `PgMaintenanceGateway` (partition DDL on both). RBAC on the
   catalog is what keeps sign-in, the switcher, capability resolution and the founder flow each
   inside one transaction; the cost is that the catalog is the last single primary, and §4 files
   what to do about it. *(was S-5)*
D15. **A transaction has one placement, and crossing it throws.** `TransactionScope` records the
   placement of the open transaction; a repository whose placement differs asks for `this.db`
   and gets an `InternalError`, on one node, in every environment. That is the tripwire that makes
   a single-Postgres deployment reveal every use-case a physical split would break. Reads that
   legitimately cross (a subscriber resolving recipients on the catalog, then writing routed
   notifications) run **before** the transaction opens, never inside it. *(was S-6)*
D16. **Two `UnitOfWork` instances, bound per slice at the DI root.** The port stays
   `run(work)`; `Container` hands `catalogUnitOfWork` to the RBAC, member, invitation and API-key
   use-cases and `routedUnitOfWork` to notification, messaging and document use-cases. The routed
   one opens on the shard the ambient `ShardScope` names. Zero use-case changes, and a mis-binding
   fails the first spec that touches it. *(was S-7)*
D17. **Foreign keys from routed tables to catalog tables stay** while physical shards = 1.
   Dropping them costs referential integrity today for a split that has not been triggered;
   `24.1` is where that decision is made, with the two options stated. *(was S-8)*
D18. **pgBouncer is always on locally, transaction mode.** `DATABASE_URL` points at `:6432`;
   `DATABASE_DIRECT_URL` at `:5432` is what migrations, `drizzle-kit`, the seed and the archive
   DDL use. pgBouncer is Tier 0 (`docs/opinions/dependencies.md`): the deployment runs it, no
   manifest names it, and a managed pooler replaces it in production without a code change. *(was S-9)*
D19. **Timeouts move server-side.** `pg` sends `statement_timeout` as a startup parameter, which a
    transaction-mode pooler must be told to ignore — and then it is gone. Measured, not assumed:
    without the ignore list `new Database({ url })` never connects at all
    (`unsupported startup parameter: statement_timeout`), and with it `SHOW statement_timeout`
    reads `0`, not a smaller number. Unlimited, on every application connection, is the state
    this decision exists to prevent. `ALTER ROLE CURRENT_USER
    SET …` in a migration is the floor that survives the pooler; the worker's longer batch timeout
    is `SET LOCAL` inside `PgUnitOfWork.run`, which is transaction-scoped and therefore
    pooler-safe. The startup parameter stays for direct connections. *(was S-10)*
D20. **`messages` stays unpartitioned.** The decision at `messaging.schema.ts` holds; `16.1` records
    the trigger that reopens it rather than leaving it to a feeling.
    `reversed: 2026-09-15 — decision D26.` *(was S-11)*
D21. **No new package, no new dependency, no new file suffix.** One new Tier 0 (pgBouncer), one new
    folder name (`shard/` in `composition`), three new `check-architecture` assertions (§21–§23),
    which makes the count twenty-three everywhere the docs say twenty — four sites, and one of
    them does not say twenty: `AGENTS.md:23`, `docs/ai/rules/workflow.md:34`,
    `docs/setup/26-hygiene-and-ci.md:369`, and `docs/ai/rules/workflow.md:14`, whose command
    block still says `18 assertions` and is stale by two before this plan touches it. *(was S-12)*
D22. **`16.14` is dropped, and the numbers stay.** (2026-09-14) At the fifteen-partition steady state
    the unbounded notification reads cost 0.21–0.87 ms and are constant in row count; the only
    bound tight enough to prune changes what the badge counts. The measurement tables stay on the
    item as the record, with the trigger that reopens it. `16.1` pins today's behaviour rather than
    the state `16.14` would have created. *(was S-13)*
D23. **Retention is the allowlist entry and nothing else.** (2026-09-14) `PartitionedTable.ALL`
    carries `retentionMonths` per table since `15.1`, which is the "one file" that was asked for.
    `retention_policy` — a row an operator edits without a deploy — has no editor until a platform
    tier exists (`21.6`), and until then a SQL edit and an allowlist edit plus a deploy are the same
    operation with a review attached to the second. Both items are in
    [`DB-SCALING-DEFERRED.md`](archive/DB-SCALING-DEFERRED.md), IDs kept.
    `revised: 2026-09-14` — reopened the same day by a broader request: an administrator managing
    ClickHouse projection, cold storage and the replica from a screen. That needs the tier, so
    Phases 18–20 build it on RBAC (Phase 18) and the row
    (`19.3`–`19.7`). The half of this decision that survives: the allowlist stays the default an
    absent row falls back to, and nothing in this plan reads a row. *(was S-14)*
D24. **Phase 22 is built in full.** (2026-09-14) The routing machinery — `ShardKey`, `ShardScope`,
    `DatabaseCluster`, the resolver, the directory, the env map — lands with the placement tripwire,
    not after it. A tripwire-only cut and a resolve-at-the-edge cut were both offered and neither
    taken.
    `revised: 2026-09-16` — still in full, minus the 256 layer: `VirtualShard`, `ShardMap`, the
    hash policy and the `_VIRTUAL` env go; `ShardKey`, `ShardScope`, `DatabaseCluster`, the
    resolver, the directory and the tripwire stay. *(was S-15)*
D25. **Every partitioned table archives before it drops, `outbox_event` included.** (2026-09-14)
    Phase 17's goal holds as written: no month is destroyed, even one that is transport. *(was S-16)*
D26. **`messages` is partitioned now, not at the trigger.** (2026-09-15) Reverses D20. The cost is
    one cache command on the send path; the trigger stays in `messaging.md` as the number that
    would have forced it. `retentionMonths: null` — domain data, never dropped, never archived. *(was S-17)*
D27. **`partition_archive` carries `bytes`, `action_counts` and `projected_at`, and prune records a
    gap rather than blocking a drop.** (2026-09-15) The admin plan's storage view, cold
    reconciliation and gap record all read this one table; nothing else in the repository records
    an object's size, and the per-action counts are free while the rows stream out. A projection
    that is off or behind costs a known hole, never an unbounded table. *(was S-18)*
D28. **The shard is the organization.** (2026-09-16) One virtual shard per tenant; the organization
    id is the `ShardKey`; the directory maps it to a physical node; node 0 until the split. What
    the 256 layer bought — moving a group with one env edit — is not needed when a tenant is one
    partition per table and moves by detach and attach. Reverses D11; revises D12 and D24. *(was S-19)*
D29. **The tenant is a partition, not a container.** (2026-09-16) The seven tenant-owned tables are
    `PARTITION BY LIST (organization_id)`; `activity_log`, `notifications` and `messages` are
    sub-partitioned by month inside each tenant. Every query already carries the tenant, so every
    query prunes to one partition for free; a tenant's month is one child to archive, drop or
    restore; a tenant is seven partitions to drop. The shared login and permission tables stay
    shared because a user belongs to several organizations; `outbox_event` stays month-only
    because the drain polls it every second. The one cross-tenant query, the projection replay,
    becomes per tenant (`16.6`). Capacity per node is now bounded by partition count — tenants ×
    tables × months kept — before it is bounded by data size; a few hundred tenants per node is
    comfortable, which is why the split stays planned. *(was S-20)*

### Admin — D30 to D50 (2026-09-14 to 16)

D30. **The platform tier is an organization.** `organizations.is_platform` marks it, a partial
   unique index guarantees at most one, and `pnpm db:seed` marks the `loadbearing` organization
   it already creates. Platform permissions are held the way every permission is held — through
   a membership and a role in that organization — and are resolved **per user**, once, and merged
   into every principal that user gets in any tenant. A platform admin switched to a customer
   tenant is still a platform admin. That is what "using RBAC" means here: no env list, no flag
   on `users`, no second permission system. *(was A-1)*
D31. **`platform` is a third scope, and it is never reached by accident.** `PermissionScope` becomes
   `"org" | "goal" | "platform"`, `CapabilitySet` gains a third axis, and `can()` gains an explicit
   branch: a platform key is granted only by the platform set, denied by the platform set, and
   touched by nothing else — a tenant's `wildcard` does not reach it, the `core` exception does
   not apply, `owner: "all"` excludes it at seed time, and an API key's `intersect` empties it.
   Four places would otherwise leak it; each is an item in Phase 18. *(was A-2)*
D32. **The first platform admin is seeded by a script; every later one is invited.** The grant
   use-case refuses a key the granter does not hold, which is the right rule and means nobody can
   grant the first `platform.*` key through the API. `pnpm platform:grant <email>` puts one user
   into the platform organization as `platform_admin`. After that, platform admins use the
   existing members screen with the platform organization active. *(was A-3)*
D33. **Absent row = the code default, for every policy table.** Borrowed from
   `notification_preferences` and from the deferred `17.8`: an empty table changes no
   behaviour, so the migration is safe and the first edit is the first change. *(was A-4)*
D34. **The application owns the bucket lifecycle configuration.** One `PutBucketLifecycleConfiguration`
   composed from every retention row, issued after the admin's write commits and again by a daily
   reconcile, because the S3 call replaces the whole configuration and a failed post-commit call
   must self-heal. A second port, not a method on `StorageGateway`: that port's header says "no
   bucket, no region, no endpoint — those are adapter configuration", and a lifecycle rule is
   bucket-shaped policy. Expiration only; a colder storage class is filed, not built. *(was A-5)*
D35. **The projection filter is one list, read by three queries.** Excluding an action from
   ClickHouse must be applied by the replay query *and* by both sides of the daily reconciliation,
   or the reconciliation reports drift every day and stops being read. A per-action TTL longer
   than the default is only expressible if the default clause carries `WHERE action NOT IN (…)`,
   because an unconditioned TTL clause deletes every row it matches. *(was A-6)*
D36. **ClickHouse gets a migration path before the app issues any DDL against it.**
   `infra/clickhouse.init.sql` runs only on an empty volume and never on a managed instance; it
   becomes migration `0000`, a version table lives in ClickHouse, and `pnpm ch:migrate` applies
   what is missing. Every later schema change — a materialized column, a new table — is a file. *(was A-7)*
D37. **Table names never come from data.** Postgres takes no bind parameter in DDL and the adapters
   inline the name, so `PartitionedTableName` and the closed action catalog are the injection
   boundary. A screen edits the number beside a name from a list; it never accepts a name. *(was A-8)*
D38. **Platform actions are audited under the platform organization.** A platform admin's active
   tenant is whichever they switched to, and an audit row under it would misattribute the change.
   Platform use-cases rebase the actor onto the platform organization for the audit call only. *(was A-9)*
D39. **The replica panel is filed behind `24.3`.** There is no routing to manage until the scaling
    plan builds it; a panel before that shows a health field and nothing to switch. *(was A-10)*
D40. **No new package, no new dependency, one new cross-cutting port, no new file suffix.**
    `PutBucketLifecycleConfigurationCommand` ships inside `@aws-sdk/client-s3`. The port is
    `StoragePolicyGateway`. Slice ports stay in the slice. `Policy`, `Rules`, `Reader`,
    `Repository`, `Gateway` are all existing role nouns. *(was A-11)*
D41. **The ClickHouse switch is a pause, not a power switch.** (2026-09-15) The environment decides
    whether the store runs; the switch decides whether it is used. Three states on screen: not
    configured (toggle disabled), on, off. Off pauses the projection, the reconcile, the lag alarm
    and the drift alarm together — a paused projection with live alarms trains people to ignore them. *(was A-12)*
D42. **A gap is recorded on the archive index, never silent, and never blocks a drop.** (2026-09-15)
    `partition_archive.projected_at` null means ClickHouse never received that tenant-month. The
    re-project action reads those rows and stamps them. The scaling plan's decision D27 is the other half. *(was A-13)*
D43. **Both switches live in one single-row table.** (2026-09-15) `platform_policy (id = 1,
    projection_enabled, replica_reads_enabled)`, typed columns rather than a key-value bag. Resolves
    where `25.2`'s switch lives. *(was A-14)*
D44. **Cold storage is read back through the worker, not through ClickHouse's `s3()` table function.**
    (2026-09-15) The convention that lifts `subject_id` out of the payload is one TypeScript
    function, and an SQL copy of it is a second implementation of a convention. The scaling plan's
    reader, whole-object at the ~8 MB tenant-month bound `21.1` already accepts, with streaming as
    the same escape hatch. One reader, two sinks. *(was A-15)*
D45. **Every destructive setting shows its consequence before the save.** (2026-09-15) From a read on
    the maintenance port (`16.8`), the same numbers the retention screen shows beside each table. *(was A-16)*
D46. **Sharding gets a map now and a button that waits.** (2026-09-15) The map reads `shard_assignments`
    once `22.3` lands; the move procedure lands with `24.2`; the contract carries
    `moves: "unavailable" | "available"` from a container getter that `24.2` flips, so the screen
    never guesses. *(was A-17)*
D47. **`messages` is partitioned with `retentionMonths: null`.** (2026-09-15) Messages are domain data
    and are never dropped; the retention screen lists the table read-only, "never dropped". *(was A-18)*
D48. **Per-tenant retention is an override row, with the table default as the fallback.** (2026-09-16)
    Hot months are exact, because prune drops that tenant's month child. Cold months per tenant are
    enforced by the worker's sweep, not by the bucket: lifecycle rules match a prefix and are capped
    at 1,000 per bucket, so the per-table rule stays as the ceiling and the app enforces anything
    shorter. *(was A-19)*
D49. **Tenant deletion archives first, drops the tenant's partitions, lets the catalog cascade, and
    keeps cold objects thirty days.** (2026-09-16) A platform action under its own key. Nothing is
    destroyed at the click; the sweep thirty days later is what forgets the tenant. *(was A-20)*
D50. **Structure is a file; policy is the dashboard; the line is "does changing it rewrite a
    table".** (2026-09-16) Which tables are split, by what key and by what time column, is one
    allowlist line and a generated migration (`16.3`, `16.11`). Every number and switch over that
    structure is a screen. A control that re-partitions a live table is a deploy wearing a
    setting's clothes, and it is not built. *(was A-21)*

---

## Phase 1 — Comment reduction and its guard rail ✅

**Built 2026-09-05.** Was `IMPLEMENTATION-PLAN.md` Phase 1; the items' full text is there.

**Goal.** Every comment is at most two lines and states the constraint, not the argument.
Arguments move to `docs/reference/`. Target density under 10 % (`core` is at 6.6 %).

- [x] `1.1` **packages/auth** `done: 2026-09-05`
- [x] `1.2` **packages/api-client** `done: 2026-09-05`
- [x] `1.3` **apps/web** `done: 2026-09-05`
- [x] `1.4` **apps/worker** `done: 2026-09-05`
- [x] `1.5` **packages/query** `done: 2026-09-05`
- [x] `1.6` **packages/application** `done: 2026-09-05`
- [x] `1.7` **packages/composition** `done: 2026-09-05`
- [x] `1.8` **packages/infrastructure** `done: 2026-09-05`
- [x] `1.9` **remaining packages** `done: 2026-09-05`
- [x] `1.10` **check-architecture: enforce the ceiling** `done: 2026-09-05`
- [x] `1.11` **rulebook update** `done: 2026-09-05`
- [x] `1.12` **density script** `done: 2026-09-05`

**Exit.** Met 2026-09-05.

---

## Phase 2 — Bugs ✅

**Built 2026-09-05.** Was `IMPLEMENTATION-PLAN.md` Phase 2; the items' full text is there.

**Goal.** Every defect below ships with a spec that fails before and passes after, and with its
reference page corrected in the same commit. Items marked **(verified)** were re-read
line-by-line during the audit.

- [x] `2.1` **(verified) `PgUnitOfWork` opens a second transaction on nested `run()`** `done: 2026-09-05`
- [x] `2.2` **(verified) `permission_overrides_uq` cannot enforce uniqueness** `done: 2026-09-05`
- [x] `2.3` **(verified) `PgVectorStore.search` cannot use the HNSW index** `done: 2026-09-05`
- [x] `2.4` **(verified) bootstrap enroller returns another tenant's organization** `done: 2026-09-05`
- [x] `2.5` **short embedding response wipes the corpus** `done: 2026-09-05`
- [x] `2.6` **activity archive counts before detach and never re-attaches** `done: 2026-09-05`
- [x] `2.7` **vendor error bodies reach the wire** `done: 2026-09-05`
- [x] `2.8` **invitation tokens stored in plaintext** `done: 2026-09-05`
- [x] `2.9` **`ValidationError.paramsFor` drops `max`** `done: 2026-09-05`
- [x] `2.10` **`RedisCacheStore.get` swallows corruption silently** `done: 2026-09-05`
- [x] `2.11` **FK and cascade inconsistencies** `done: 2026-09-05`
- [x] `2.12` **no index for the projection reader** `done: 2026-09-05`
- [x] `2.13` **invite: mail failure after commit; `lower(email)` defeats the index** `done: 2026-09-05`
- [x] `2.14` **`core.activity.write` is asserted inconsistently — closes `T-030`** `done: 2026-09-05`
- [x] `2.15` **(verified) two-factor status never reaches the security page** `done: 2026-09-05`
- [x] `2.16` **(verified) list query keys ignore their params** `done: 2026-09-05`
- [x] `2.17` **(verified) 403 renders as "please sign in"; 400 renders " is not valid"** `done: 2026-09-05`
- [x] `2.18` **(verified) `requireSession()` drops the destination** `done: 2026-09-05`
- [x] `2.19` **open-redirect regex admits a backslash** `done: 2026-09-05`
- [-] `2.20` **`SessionGuard` navigates during render** `dropped: 2026-09-17` — moot — `5.15` closed and deleted the component with it.
- [x] `2.21` **`Field` never associates hint and error with the input** `done: 2026-09-05`
- [x] `2.22` **list components: loading, error, empty, current-session** `done: 2026-09-05`
- [x] `2.23` **form state defects** `done: 2026-09-05`
- [x] `2.24` **`AuthClient.signOut()` ignores the error** `done: 2026-09-05`
- [x] `2.25` **`font.css` references two missing `.woff2` files** `done: 2026-09-05`
- [x] `2.26` **the archive's row stream keeps querying a partition nobody is uploading** `done: 2026-09-05`

**Exit.** Met 2026-09-05.

---

## Phase 3 — Convention and pattern clean-up ✅

**Built 2026-09-05.** Was `IMPLEMENTATION-PLAN.md` Phase 3; the items' full text is there.

**Goal.** The tree matches `docs/ai/rules` and `docs/opinions`, or the opinion is updated to
match a decision the tree already made.

- [x] `3.1` **loose files under `packages/auth/src`** `done: 2026-09-05`
- [x] `3.2` **barrels that are scripts** `done: 2026-09-05`
- [x] `3.3` **`withOrganizationSlug` mutable setter → constructor arg** `done: 2026-09-05`
- [x] `3.4` **static mutable state** `done: 2026-09-05`
- [x] `3.5` **two classes per file** `done: 2026-09-05`
- [x] `3.6` **`OrganizationFounder` port lacks `slug`** `done: 2026-09-05`
- [x] `3.7` **fakes diverge from adapters** `done: 2026-09-05`
- [x] `3.8` **`TestContainer` unreachable outside `composition`** `done: 2026-09-05`
- [x] `3.9` **duplication in `feature` and `apps/web`** `done: 2026-09-05`
- [x] `3.10` **`TwoFactorForm` bypasses the query seam** `done: 2026-09-05`
- [x] `3.11` **`QueryKeys.session` is a bare array** `done: 2026-09-05`
- [x] `3.12` **barrels named `index.tsx` with no JSX** `done: 2026-09-05`
- [x] `3.13` **duplicate DOM ids across auth forms** `done: 2026-09-05`
- [x] `3.14` **unused dependency** `done: 2026-09-05`
- [x] `3.15` **role-suffix vocabulary** `done: 2026-09-05`
- [x] `3.16` **layering graph vs `composition → content`** `done: 2026-09-05`
- [x] `3.17` **abbreviated params in the authorization kernel** `done: 2026-09-05`
- [x] `3.18` **`permission` module grammar** `done: 2026-09-05`
- [x] `3.19` **missing `override`** `done: 2026-09-05`
- [x] `3.20` **`apps/worker` folder rules** `done: 2026-09-05`
- [x] `3.21` done: 2026-09-05 · **the Postgres harness picks whichever tenant Postgres … `done: 2026-09-05`

**Exit.** Met 2026-09-05.

---

## Phase 4 — Docs drift already present ✅

**Built 2026-09-06.** Was `IMPLEMENTATION-PLAN.md` Phase 4; the items' full text is there.

**Goal.** No sentence in `docs/`, `README.md`, `AGENTS.md`, `plans/TODO.md` or
`packages/*/docs` describes something that is not true of the tree. Link resolution is already
clean (1 601 of 1 601) and every `meta.json` matches its pages; the drift is in prose, paths
and counts.

- [x] `4.1` `packages/errors/docs` — `reference/catalog.md:40` says `RATE_LIMITED` and … `done: 2026-09-06`
- [x] `4.2` `packages/core/docs/index.md` — "four exports"; `Token` is the fifth, missing … `done: 2026-09-06`
- [x] `4.3` `packages/permissions/docs/index.md` — trees omit `core.permissions.ts`, … `done: 2026-09-06`
- [x] `4.4` `packages/contracts/docs/index.md` — "none ship yet" (`role/`, `member/` ship); … `done: 2026-09-06`
- [x] `4.5` `packages/application/docs` — `meta.json` and `index.md:3` say "ten ports", the … `done: 2026-09-06`
- [x] `4.6` `packages/infrastructure/docs` — `index.md` tree omits `smtp/`; … `done: 2026-09-06`
- [x] `4.7` `packages/composition/docs` — "two exports" is three (`HealthReport`); 9 of 15 … `done: 2026-09-06`
- [x] `4.8` **stale `db` package** `done: 2026-09-06`
- [x] `4.9` `packages/asset/docs/index.md:111` and `font.css:1-2` name `ui/src/token/token.css` … `done: 2026-09-06`
- [x] `4.10` `packages/ui/docs/index.md` — `ThemeRegistry.apply` shown setting `colorScheme` … `done: 2026-09-06`
- [x] `4.11` `packages/content/docs/index.md` — "four namespaces per locale" (eight); "eight … `done: 2026-09-06`
- [x] `4.12` `packages/api-client/docs/index.md` — tree omits `account.client.ts`, … `done: 2026-09-06`
- [x] `4.13` `packages/query/docs/index.md` — tree lists 3 of 7 folders; `Env.apiUrl` example … `done: 2026-09-06`
- [x] `4.14` `packages/feature/docs/index.md` — tree lists 7 of 27 files (`account/`, … `done: 2026-09-06`
- [x] `4.15` `README.md` — "Sign up at `/sign-in`" (there is `/sign-up`); step 6 and the … `done: 2026-09-06`
- [x] `4.16` `docs/ai/index.md:57-59` draws `CLAUDE.md ├── @AGENTS.md` — false; `:86-89` … `done: 2026-09-06`
- [x] `4.17` `plans/TODO.md` state table — dated 2026-08-29 in a file updated 2026-09-03; … `done: 2026-09-06`
- [x] `4.18` `docs/setup/25-worker-app.md` (worst page) — install block omits `contracts`, … `done: 2026-09-06`
- [x] `4.19` `docs/setup/26-hygiene-and-ci.md` — `scope-enum` block has `db`, lacks `errors` … `done: 2026-09-06`
- [x] `4.20` `docs/setup/27-verification-and-first-feature.md` — "Fifteen commits" over … `done: 2026-09-06`
- [x] `4.21` `docs/setup/28-folder-structure.md` — "after step 26" vs 27; sixteen packages … `done: 2026-09-06`
- [x] `4.22` **wrong backticked paths** `done: 2026-09-06`
- [x] `4.23` **shipped features with no setup page** `done: 2026-09-06`
- [x] `4.24` **rules ↔ opinions disagreements** `done: 2026-09-06`
- [x] `4.25` **`apps/desktop` does not exist** `done: 2026-09-06`
- [x] `4.26` **doc-drift gate** `done: 2026-09-06`
- [x] `4.27` `docs/infra` — `reference/compose.md:157-171` and `README.md:16-26` describe an … `done: 2026-09-06`

**Exit.** Met 2026-09-06.

---

## Phase 5 — Feature gaps: close or cut ✅

**Built 2026-09-06.** Was `IMPLEMENTATION-PLAN.md` Phase 5; the items' full text is there.

**Goal.** Every declared seam either has a consumer or is gone. Each "build" item follows the
twelve steps in `docs/ai/skills/add-slice.md` and its commit sequence.

- [x] `5.1` **Role management** `done: 2026-09-06`
- [x] `5.2` **Effective permissions inspector** `done: 2026-09-06`
- [x] `5.3` **Member lifecycle** `done: 2026-09-06`
- [x] `5.4` **API keys** `done: 2026-09-06`
- [x] `5.5` **Document index and search** `done: 2026-09-06`
- [x] `5.6` **Error surfaces** `done: 2026-09-06`
- [x] `5.7` **Navigation from data** `done: 2026-09-06`
- [x] `5.8` **Home page, `/settings` index, deep-link return** `done: 2026-09-06`
- [x] `5.9` **Locale** `done: 2026-09-06`
- [x] `5.10` **SSR uses the in-process client** `done: 2026-09-06`
- [x] `5.11` **`EventBus`** `done: 2026-09-06`
- [x] `5.12` **Analytics rollups** `done: 2026-09-06`
- [x] `5.13` **`LogReader`, `StorageGateway.presign*`, `QueuePublisher.publish`** `done: 2026-09-06`
- [x] `5.14` **Event codes never emitted** `done: 2026-09-06`
- [x] `5.15` **Zero-consumer symbols** `done: 2026-09-06`
- [x] `5.16` **`/kitchen-sink` ships to production** `done: 2026-09-06`

**Exit.** Met 2026-09-06.

---

## Phase 6 — Tests for what is risky and untested ✅

**Built 2026-09-06.** Was `IMPLEMENTATION-PLAN.md` Phase 6; the items' full text is there.

- [x] `6.1` **`Container`** `done: 2026-09-06`
- [x] `6.2` **application and auth** `done: 2026-09-06`
- [x] `6.3` **query and client** `done: 2026-09-06`
- [x] `6.4` **forms** `done: 2026-09-06`
- [x] `6.5` **`T-026`** `done: 2026-09-06`
- [x] `6.6` **query-count assertions** `done: 2026-09-06`
- [x] `6.7` **no package typechecks its own tests** `done: 2026-09-06`
- [x] `6.8` **`tooling/scripts` fixtures** `done: 2026-09-06`

**Exit.** Met 2026-09-06.

---

## Phase 7 — Improvements ✅

**Built 2026-09-06.** Was `IMPLEMENTATION-PLAN.md` Phase 7; the items' full text is there.

- [x] `7.1` `SystemRoleSeed.run` issues one SELECT per role (four) and runs on every … `done: 2026-09-06`
- [x] `7.2` `PgApiKeyRepository.touch` writes `last_used_at` on every authenticated API … `done: 2026-09-06`
- [x] `7.3` `PgMaintenanceGateway.sweepExpired` uses `.returning({ id })` to count — … `done: 2026-09-06`
- [x] `7.4` `PgMembershipReader.organizationsFor` has no limit — cap at 100 and document. … `done: 2026-09-06`
- [x] `7.5` `/organization/create` is bounded only by a 5/min rate limit; each call seeds … `done: 2026-09-06`
- [x] `7.6` `ClickHouseConnection.encode` builds `'${String(v)}'` with no escaping — escape … `done: 2026-09-06`
- [x] `7.7` `Uuid.isValid` checks the variant nibble, not the version — tighten to `[7]` or … `done: 2026-09-06`
- [x] `7.8` `Container.dispose()` never closes the SMTP transport — `SmtpEmailSender.close()`. … `done: 2026-09-06`
- [x] `7.9` `MessageStore.ensure` has no in-flight de-duplication (`SessionStore.ensure` has) … `done: 2026-09-06`
- [x] `7.10` `auth` namespace is 82 keys and every one loads for `/forgot-password` — split … `done: 2026-09-06`
- [x] `7.11` `useAppMutation` gains `onMutate`/rollback so revoke-invitation, unlink-account … `done: 2026-09-06`
- [x] `7.12` a11y — `PermissionMatrix` empty `<th>` (`aria-label`), `<header>`/`<nav>` … `done: 2026-09-06`
- [x] `7.13` `AppError.from` adopts a client-supplied `traceId` — only on the client path; … `done: 2026-09-06`
- [x] `7.14` `LokiLogReader implements LogReader` while every sibling `extends` — align, and … `done: 2026-09-06`
- [x] `7.15` `AnalyticsConsumer` lag: `lagSeconds` is 0 forever on an empty destination — … `done: 2026-09-06`
- [x] `7.16` `SystemPrincipal.GRANTS` validated per job — once at module load, frozen. … `done: 2026-09-06`

**Exit.** Met 2026-09-06.

---

## Phase 8 — Worker, tooling, CI, infra, migrations ✅

**Built 2026-09-05 → 06.** Was `IMPLEMENTATION-PLAN.md` Phase 8; the items' full text is there.

`P8.3` — the worker's SMTP requirement — is the one item that stayed open; it is `23.4`.

- [x] `8.1` **(verified) second signal hard-kills a graceful drain** `done: 2026-09-06`
- [x] `8.2` **(verified) signal handlers registered after `start()`; losing race promise … `done: 2026-09-06`
- [x] `8.3` **partition runway and sweeps** `done: 2026-09-06`
- [x] `8.4` **structure** `done: 2026-09-06`
- [x] `8.5` **(verified) summary counts skipped as passed** `done: 2026-09-06`
- [x] `8.6` **§8 cannot see a stale bundle** `done: 2026-09-06`
- [x] `8.7` **assertion blind spots** `done: 2026-09-06`
- [x] `8.8` **new schema assertions** `done: 2026-09-06`
- [x] `8.9` **scripts are untyped and untested** `done: 2026-09-06`
- [x] `8.10` **(verified) pre-push runs only ESLint** `done: 2026-09-06`
- [x] `8.11` **`ci.yml`** `done: 2026-09-06`
- [x] `8.12` **doc-promised jobs** `done: 2026-09-06`
- [x] `8.13` **auth tables** `done: 2026-09-06`
- [x] `8.14` **unpartitioned append-only tables** `done: 2026-09-06`
- [x] `8.15` **migrations that fail on existing data** `done: 2026-09-06`
- [x] `8.16` **seed** `done: 2026-09-06`
- [x] `8.17` **compose** `done: 2026-09-06`
- [x] `8.18` **env templates** `done: 2026-09-06`
- [x] `8.19` **stale worktree** `done: 2026-09-06`
- [x] `8.20` **`lint-staged` fails on Windows above roughly sixty staged files** `done: 2026-09-06`
- [x] `8.21` **`lint-staged` never formats `tooling/scripts/*.mjs`** `done: 2026-09-06`
- [x] `8.22` **`scope-enum` has no `observability`** `done: 2026-09-06`

**Exit.** Met 2026-09-06.

---

## Phase 9 — Unified mail pipeline ✅

**Built 2026-09-12.** Was `COMMUNICATION-PLAN.md` Phase 1; the items' full text is there.

**Goal.** One path for every mail: a caller publishes a *mail request* (template key + typed
params + recipient + locale) and a job lands on `QueueName.MAIL`; the worker renders it to text
and HTML and sends it through `EmailSender`, with BullMQ's retries, backoff and duplicate
suppression, plus a rate limiter. Better Auth's four mails and the invitation mail move onto it.
`DigestComposer` is deleted.

Six IDs of the original plan (`C1.5`, `C1.12`, `C1.13`, `C1.14`, `C1.20`, `C1.21`) were retired before anything was built and are not renumbered here.

- [x] `9.1` **`QueueName.MAIL`** `done: 2026-09-12`
- [x] `9.2` **`JobOptions.priority` and `JobOptions.name`** `done: 2026-09-12`
- [x] `9.3` **`EmailSender.send` returns a receipt** `done: 2026-09-12`
- [x] `9.4` **Generalise partition maintenance** `done: 2026-09-12`
- [x] `9.5` **Template manifest in `contracts`** `done: 2026-09-12`
- [x] `9.6` **`MailPublisher` port** `done: 2026-09-12`
- [x] `9.7` **`MailRenderer` port** `done: 2026-09-12`
- [x] `9.8` **`mail` slice in `application`** `done: 2026-09-12`
- [x] `9.9` **Mail layout** `done: 2026-09-12`
- [x] `9.10` **`ContentMailRenderer`** `done: 2026-09-12`
- [x] `9.11` **`QueuedMailPublisher`** `done: 2026-09-12`
- [x] `9.12` **Auth mail moves onto the pipeline** `done: 2026-09-12`
- [x] `9.13` **Invitation mail moves onto the pipeline** `done: 2026-09-12`
- [x] `9.14` **Container** `done: 2026-09-12`
- [x] `9.15` **`MailConsumer`** `done: 2026-09-12`
- [x] `9.16` **Delete `DigestComposer`** `done: 2026-09-12`
- [x] `9.17` **Event codes** `done: 2026-09-12`
- [x] `9.18` **CI greps** `done: 2026-09-12`
- [x] `9.19` **Docs** `done: 2026-09-12`

**Exit.** Met 2026-09-13.

---

## Phase 10 — Transactional outbox ✅

**Built 2026-09-12.** Was `COMMUNICATION-PLAN.md` Phase 2; the items' full text is there.

**Goal.** A use-case publishes a past-tense domain event inside its unit of work and knows
nothing about who listens. The worker drains the outbox into BullMQ, one job per
(subscriber, event), and every subscriber is idempotent on the event id. Broker-shaped by
construction (`docs/opinions/data-and-scale.md` §7): `publish` returns nothing, no ordering,
no handler exception reaches the publisher.

Two findings from walking the Exit line stayed open: the `jobId` suppression window (`23.1`) and the smoke probe on the live queue (`23.2`).

- [x] `10.1` **Domain event catalog** `done: 2026-09-12`
- [x] `10.2` **`outbox_event`** `done: 2026-09-12`
- [x] `10.3` **`DomainEventPublisher` port** `done: 2026-09-12`
- [x] `10.4` **`OutboxGateway` port** `done: 2026-09-12`
- [x] `10.5` **`EventSubscriber` seam** `done: 2026-09-12`
- [x] `10.6` **First publishers and the proving subscriber** `done: 2026-09-12`
- [x] `10.7` **`PgOutboxPublisher`, `PgOutboxGateway`** `done: 2026-09-12`
- [x] `10.8` **`OutboxConsumer` + `OutboxDrainSchedule`** `done: 2026-09-12`
- [x] `10.9` **Container** `done: 2026-09-12`

**Exit.** Met 2026-09-13.

---

## Phase 11 — Notifications: inbox, email, preferences, digest ✅

**Built 2026-09-12.** Was `COMMUNICATION-PLAN.md` Phase 3; the items' full text is there.

**Goal.** A domain event becomes zero or more `notifications` rows (one per recipient), each
delivered to the bell immediately over real-time (Phase 12 — until then the list refetches on
focus), and to email either at once or in a daily digest, according to the recipient's
preference for that category. Every write is idempotent on `(event_id, user_id, kind)`.

- [x] `11.1` **Keyset primitive** `done: 2026-09-12`
- [x] `11.2` **Keys** `done: 2026-09-12`
- [x] `11.3` **`contracts/src/notification/`** `done: 2026-09-12`
- [x] `11.4` **`notifications`** `done: 2026-09-12`
- [x] `11.5` **`notification_preferences`** `done: 2026-09-12`
- [x] `11.6` **Ports** `done: 2026-09-12`
- [x] `11.7` **`NotificationPolicy`** `done: 2026-09-12`
- [x] `11.8` **Use-cases** `done: 2026-09-12`
- [x] `11.9` **`PgNotificationRepository`, `PgNotificationPreferenceRepository`, `PgNotificationRecipientReader`** `done: 2026-09-12`
- [x] `11.10` **`NotificationSubscriber`** `done: 2026-09-12`
- [x] `11.11` **Digest** `done: 2026-09-12`
- [x] `11.12` **Container** `done: 2026-09-12`
- [x] `11.13` **Query layer** `done: 2026-09-12`
- [x] `11.14` **Copy** `done: 2026-09-12`
- [x] `11.15` **Components** `done: 2026-09-12`
- [x] `11.16` **Transport + routes** `done: 2026-09-12`
- [x] `11.17` **Docs** `done: 2026-09-12`

**Exit.** Met 2026-09-13.

---

## Phase 12 — Real-time delivery: SSE over oRPC, Redis fan-out ✅

**Built 2026-09-12 → 13.** Was `COMMUNICATION-PLAN.md` Phase 4; the items' full text is there.

**Goal.** A signed-in tab holds one server-sent stream and receives its own notifications,
messages and typing signals within milliseconds, across any number of web replicas, with no
new dependency. Reconnects are safe: the client refetches what it subscribes to rather than
trusting a replay that pub/sub cannot give.

The last three were found on first opening the app in a browser — the client half had never been run. `C4.10`, the QueryClient dehydration decision, stayed open and is `23.3`.

- [x] `12.1` **`RealtimeChannel`** `done: 2026-09-12`
- [x] `12.2` **Ports + wire shape** `done: 2026-09-12`
- [x] `12.3` **Redis adapters** `done: 2026-09-13`
- [x] `12.4` **Container + config + health** `done: 2026-09-13`
- [x] `12.5` **Verify the oRPC surface first** `done: 2026-09-12`
- [x] `12.6` **Contract + router** `done: 2026-09-13`
- [x] `12.7` **Prove the pipe end to end before building on it** `done: 2026-09-13`
- [x] `12.8` **Query layer** `done: 2026-09-13`
- [x] `12.9` **Wire the notifications** `done: 2026-09-13`
- [x] `12.10` **The RPC link was given a relative URL.** `done: 2026-09-13`
- [x] `12.11` **The no-flash script read as a hydration mismatch on every load.** `done: 2026-09-13`
- [x] `12.12` **`vite build` inherited `NODE_ENV=development` from `.env`** `done: 2026-09-13`

**Exit.** Met 2026-09-13.

---

## Phase 13 — Messaging: conversations and messages ✅

**Built 2026-09-13.** Was `COMMUNICATION-PLAN.md` Phase 5; the items' full text is there.

**Goal.** Direct messages and group channels inside an organization: create, list, read with
keyset pagination, send with optimistic rendering, edit and delete your own, read receipts and
per-conversation unread counts, typing indicators — all live through Phase 12, with `message.sent`
also on the outbox so the notification policy can turn an unread DM into a bell item and a
digest line.

- [x] `13.1` `messaging.permissions.ts`: `messaging.conversation.read`, `.create`, `.manage`, … `done: 2026-09-13`
- [x] `13.2` `contracts/src/messaging/{index,conversation.contract,conversation.entity,conversation.procedures,message.contract,message.entity,message.procedures}.ts`; … `done: 2026-09-13`
- [x] `13.3` **`conversations`, `conversation_members`** `done: 2026-09-13`
- [x] `13.4` **`messages`** `done: 2026-09-13`
- [x] `13.5` **Ports** `done: 2026-09-13`
- [x] `13.6` **Use-cases** `done: 2026-09-13`
- [x] `13.7` **`MessagingRealtimeSubscriber`** `done: 2026-09-13`
- [x] `13.8` `PgConversationRepository`, `PgMessageRepository`; `KeysetCursor` codec … `done: 2026-09-13`
- [x] `13.9` **Notification policy rows** `done: 2026-09-13`
- [x] `13.10` **Conversation stream** `done: 2026-09-13`
- [x] `13.11` **Query layer** `done: 2026-09-13`
- [x] `13.12` **Copy + UI + feature** `done: 2026-09-13`
- [x] `13.13` **Transport + routes** `done: 2026-09-13`
- [x] `13.14` `packages/application/docs/reference/messaging.md` (direct-key uniqueness, … `done: 2026-09-13`

**Exit.** Met 2026-09-13.

---

## Phase 14 — Connection pooling: the pool you can see, and the pooler in front of it ✅

**Built 2026-09-13.** Was `DB-SCALING-PLAN.md` Phase 1; the items' full text is there.

**Goal.** Every pool knob is an env var read once in `env.ts`, the pool's saturation is a log
line and a health field rather than a guess, the worker cannot silently oversubscribe its own
pool, and every local and production connection goes through pgBouncer in transaction mode with
the timeouts still enforced — proven by a smoke spec that runs the pooler-sensitive paths.

- [x] `14.1` **`DatabaseConfig` complete** `done: 2026-09-13`
- [x] `14.2` **`ContainerConfig.database` grows** `done: 2026-09-13`
- [x] `14.3` **Both `env.ts` files read the six vars** `done: 2026-09-13`
- [x] `14.4` **`Database.stats()` and the health field** `done: 2026-09-13`
- [x] `14.5` **`database.pool.saturated`** `done: 2026-09-13`
- [x] `14.6` **`worker.pool.oversubscribed`** `done: 2026-09-13`
- [x] `14.7` **Role-level timeouts migration** `done: 2026-09-13`
- [x] `14.8` **`SET LOCAL` in `PgUnitOfWork.run`** `done: 2026-09-13`
- [x] `14.9` **The service** `done: 2026-09-13`
- [x] `14.10` **`.env.example` and the scripts** `done: 2026-09-13`
- [x] `14.11` **The archive's DDL goes direct** `done: 2026-09-13`
- [x] `14.12` **The pooled smoke spec** `done: 2026-09-13`
- [x] `14.13` **Docs** `done: 2026-09-13`

**Exit.** Met 2026-09-13.

---

## Phase 15 — Partition policy on the allowlist ✅

**Built 2026-09-13 → 17.** Was `DB-SCALING-PLAN.md` 2.A and `S2.4`; the items' full text is there.

**Goal.** Each partitioned table declares its own column in one place and its retention as data,
the guard that a hand-edited migration matches that declaration is a build failure rather than a
paragraph in `docs/setup/13`, the runway cannot be lost by a worker that was asleep on the first of
the month, partition pruning is proven by `EXPLAIN` rather than assumed, every table that grows
with activity is on the list, `messages` included (`16.2`), every tenant-owned table is a tenant
partition first (`16.3`) — and **no month is ever destroyed**: retention
moves a partition to S3 and drops it only once the object is written and verified (Phase 17).

- [x] `15.1` **`PartitionedTable` entries** `done: 2026-09-13`
- [x] `15.2` **`MaintenanceGateway.monthlyPartitionsAfter(table, from): Promise<number>`** `done: 2026-09-13`
- [x] `15.3` **Runway at boot and the low-runway line** `done: 2026-09-13`
- [x] `15.4` **§21 in `check-architecture.mjs`** `done: 2026-09-17`

**Exit.** Met 2026-09-17.

---

## Phase 16 — Pruning proven, and the tenant layout

**Goal.** Each partitioned table declares its own column in one place and its retention as data,
the guard that a hand-edited migration matches that declaration is a build failure rather than a
paragraph in `docs/setup/13`, the runway cannot be lost by a worker that was asleep on the first of
the month, partition pruning is proven by `EXPLAIN` rather than assumed, every table that grows
with activity is on the list, `messages` included (`16.2`), every tenant-owned table is a tenant
partition first (`16.3`) — and **no month is ever destroyed**: retention
moves a partition to S3 and drops it only once the object is written and verified (Phase 17).

**Design in one paragraph.** `PartitionedTable.ALL` becomes a frozen list of
`{ name, column, retentionMonths }` so `MaintenanceConsumer.PRUNE_AFTER_MONTHS` disappears and the
next partitioned table is one entry, not one entry plus one record. `check-architecture` §21 reads
`migrations/*.sql` for `PARTITION BY RANGE ("<col>")`, requires the table to be in the allowlist
with that column, requires the primary key in the same statement to include it, and fails on any
`DEFAULT` partition — the hand-edited DDL that §17 and §18 are documented as blind to.
`MaintenanceGateway` gains `monthlyPartitionsAfter(table, from)`; the worker calls
`ensureMonthlyPartitions` for every table once at boot (idempotent, and cheap: one `to_regclass`
per month), and `partition.runway.low` fires when fewer than two future months exist. An
integration spec runs `EXPLAIN (FORMAT JSON)` over each partitioned table's keyset query and
asserts one partition is scanned. `pnpm db:partitions` gives the operator the same routine from
a shell. Everything here is written against one `Database` and Phase 22 loops it per shard.

Phase 17 then changes what retention *means*. Today `prune()` drops a partition and the month is
gone; `activity_log` is the only table that survives, because `PgActivityArchiveGateway` already
detaches it, streams it to S3 as gzipped NDJSON, records it and verifies the object before
dropping. That mechanism is generalised to every partitioned table, its objects are cut per tenant
so a user can be given their own rows back, a restore is built and round-tripped by a spec, and the
retention number moves out of the code into a row an operator can edit without a deploy.

#### Background

**Context.**

The kit runs one `pg.Pool` per process, ten connections, and nothing outside
`packages/infrastructure/src/pg/primitive/database.ts` can change that: `ContainerConfig.database`
carries a `maxConnections?` that neither `apps/web/src/env.ts` nor `apps/worker/src/env.ts` sets,
`statementTimeoutMs` never reaches `ContainerConfig` at all (`DatabaseConfig` has carried it
since `database.ts:7`, which is what makes the plumbing a config change and not a `Pool` one), and the worker's six consumers default to
twenty concurrent jobs against those ten connections. There is no pooler in
`infra/docker-compose.yml`, so the arithmetic in `docs/infra/reference/postgres.md` — "forty
replicas is the point pgBouncer stops being optional" — has no switch to flip. Three tables are
month-partitioned by hand-edited DDL, their retention lives as a constant in
`apps/worker/src/consumer/maintenance.consumer.ts` rather than beside the table, their runway
depends on one schedule the worker must be awake for on the first of the month, and no assertion
in `tooling/scripts/check-architecture.mjs` reads the `PARTITION BY` lines it cannot see in the
drizzle schema. And there is no routing seam: `BaseRepository.db` is one client, so
`docs/opinions/data-and-scale.md` §5's "shard by `organization_id`, weeks" is weeks because every
repository, the unit of work, both apps' edges, the migrator and five cross-tenant worker paths
would all change at once.

The request: partitioning, virtual sharding and connection pooling, to industry practice. The
opinion page's own ladder orders those by cost — pooling is move #4 (hours), sharding #7 (weeks) —
and says not to build in advance. `docs/ai/rules/simplicity.md` gives the one exception: a seam
earns its place early when the swap is certain and the retrofit is spread rather than local. Every
item here is either that seam, a guard on something already built, or an operator knob that today
does not exist. The physical split itself is filed, not built.

**What exists and is reused.**

Re-read at `49703c9`, where every line below still holds. One thing moved: a twenty-second
migration, `0021_cold_guardian.sql`, has landed since `c72ca9e`, so the numbers this plan
reserves shift by one — `14.7` is `0022`, `22.3` was `0023` and is `0024` since `16.2` took `0023`
(2026-09-15) — and `check-architecture` §21 runs
against twenty-two migrations, not twenty-one.

- `Database` takes a config object, not a URL — `docs/setup/13` says so it could grow pool tuning
  without touching call sites. It grows here.
- `TransactionScope` / `BaseRepository.db` / `PgUnitOfWork` — the ambient-transaction shape the
  placement tripwire is built into, not beside.
- `PartitionedTable.ALL`, `PgMaintenanceGateway.ensureMonthlyPartitions` /
  `dropMonthlyPartitionsBefore`, `MaintenanceConsumer`, `partitions.schedule.ts` — the partition
  lifecycle exists; this plan moves its policy and guards it.
- `CapabilityCache` (`packages/auth/src/principal/capability.cache.ts`) — the read-through +
  invalidate shape `PgShardResolver` copies, TTL and prefix included.
- `CacheStore`, `CapabilityInvalidator` — the ports a cached resolver already has.
- `PgOrganizationFounder` — the one place a tenant is created, so the one place a directory row
  is first written.
- `principalMiddleware` in `apps/web/src/server/orpc/base.ts` — where the key enters scope on
  the web; `SystemPrincipal.forOrganization` in the worker — where it enters for a job.
- `Container.health()` breakdown and `dispose()` ordering — extended per shard, not rewritten.
- The observability catalog (`packages/observability/src/catalog/core.events.ts`) — new codes
  join it; `EventShape` makes an undeclared field a compile error.
- `check-architecture.mjs` §9 `TENANT_EXEMPT`, §17, §18, §20 — §9's set becomes derived from
  `CatalogTable`, and §21–§23 use §17's bracket-matched parse.
- `vitest.smoke.config.ts` + `tests/smoke/` in `infrastructure` — where the pooled and rehearsal
  specs live.

**Vocabulary fixed up front.**

| Thing | Name |
|---|---|
| Env, pool (both `env.ts`) | `DATABASE_URL` (pooled), `DATABASE_DIRECT_URL`, `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS`, `DATABASE_POOL_CONNECT_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS` |
| Env, shards | `DATABASE_SHARD_<n>_URL`, `DATABASE_SHARD_<n>_DIRECT_URL`, `n ≥ 1` (no range map since 2026-09-16: the directory names the node) |
| Table (catalog) | `shard_assignments (shard_key, node)` |
| Seeds (`pg/seed/`) | `TenantPartitionSeed` (`16.4`), run wherever an organization is created |
| Partition names | `<table>_<32hex>` and `<table>_<32hex>_<yyyy>_<mm>`; the longest is 57 of Postgres's 63 characters |
| Tables (cold storage) | `partition_archive` (per tenant, per table, per month; `catalog`; `bytes`, `action_counts`, `projected_at` added 2026-09-15 in `17.2`) |
| Primitives (`application/src/primitive/`) | `ShardKey`, `Placement` (`"catalog" \| "local" \| "routed"`), `CatalogTable`, `PartitionedTable` (`column`, `retentionMonths` built in `15.1`; `messages` joins `ALL` in `16.2`; `tenantKey` and `column \| null` with eight entries in `16.3`) |
| Ports (cold storage) | `PartitionArchiveGateway` (replaces `ActivityArchiveGateway`), `ColdArchiveReader` |
| Ports (`application/src/port/`) | `ShardingStrategy`, `ShardResolver`, `ShardAssignmentRepository`; `MaintenanceGateway.partitionsBefore` (`16.8`), `.ensureTenantPartitions` (`16.4`), `.dropTenantPartitions` (`16.5`); `AnalyticsProjector.checkpoint(organizationId)` (`16.6`); `CacheStore.setIfAbsent` (`16.2`) |
| Infrastructure (`pg/primitive/`) | `DatabaseCluster` |
| Infrastructure (`pg/transaction/`) | `ShardScope`, `TransactionScope` (carries placement) |
| Infrastructure (`pg/repository/`) | `PgShardResolver`, `PgShardAssignmentRepository` |
| Composition (`src/shard/`, new folder) | `OrganizationShardingStrategy` |
| Log event codes | `database.pool.saturated` (warn), `worker.pool.oversubscribed` (warn), `partition.runway.low` (warn, gains `organizationId` in `16.5`), `shard.assignment.created` (info, `{ key, node }`), `shard.resolution.failed` (error), `cold.partition.restored` (info), `cold.objects.swept` (info), `analytics.projection.gap` (warn, `17.5`), `analytics.reconciliation.drifted` gains `organizationId` (`16.6`) — an archived month keeps the existing `maintenance.partition.archived` |
| S3 prefix | `cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz` — one lifecycle rule on `cold/` tiers every table |
| Scripts | `pnpm db:partitions`, `pnpm infra:up:sharded`; `pnpm db:generate` becomes `drizzle-kit generate` then `partition-ddl.ts` (`16.11`) |
| Compose services | `pgbouncer` (core), `postgres-shard-1` (profile `sharded`) |
| Assertions | §21 partition DDL ↔ allowlist · §22 one placement per repository file · §23 `new Database(` only in the cluster and the scripts |
| Docs pages (new) | `docs/infra/reference/pgbouncer.md`, `packages/infrastructure/docs/reference/sharding.md`, `packages/infrastructure/docs/reference/partitions.md`, `packages/infrastructure/docs/reference/cold-storage.md` |

---

#### The ruler

- [x] `16.1` **Pruning is proven** `done: 2026-09-18` — `packages/infrastructure/tests/pg/partition-pruning.spec.ts`
  (integration, needs Postgres): for each of the three tables, insert into two months, run the
  slice's keyset query with a one-month window under `EXPLAIN (FORMAT JSON)`, assert exactly one
  `Append` child. This is the assertion that a future `WHERE` clause that drops the partition
  column is caught by a test, not by a slow production query. **Docs:**
  `packages/infrastructure/docs/reference/partitions.md` (new, `16.10`).
  `corrected: 2026-09-13` — **the premise is wrong: there is no one-month window to pass.**
  `PgNotificationRepository.list` has no lower bound on `created_at` at all — the keyset cursor
  supplies only the upper half of the predicate, `(created_at, id) < (at, id)`. Measured on six
  live partitions with `EXPLAIN (FORMAT JSON)`:

  | query | partitions scanned |
  |---|---|
  | `list`, no cursor | **6 of 6** |
  | `list`, with a cursor | **6 of 6** |
  | `countUnread` | **6 of 6** |
  | `existsUnread` | **6 of 6** |
  | `markAllRead` | **6 of 6** |
  | `listUnreadSince` (`created_at >`, one month back) | 4 of 6 — older months pruned, every future month kept |
  | `outbox_event` drain, verbatim | **6 of 6** |
  | `activity_log` replay, the real two-arm `OR` | 5 of 6 |
  | `activity_log` daily rollup (`>= from and < to`) | **1** |
  | `notifications` with an explicit one-month range | **1** |
  | `markRead` (`created_at =`) | **1** |

  `verified: 2026-09-13, second pass` — the first pass EXPLAINed hand-written SQL; this table is
  from **drizzle's own statements**, captured through `DatabaseConfig.logger` off the real
  repository methods, and run as `EXPLAIN (ANALYZE, FORMAT JSON)` with the real bound parameters
  via node-postgres — so execution-time pruning had its chance. `Subplans Removed` was **0** on
  every row. The numbers did not move; the row-constructor cursor is not prunable at plan time or
  at run time.

  A row-constructor `<` is not decomposed by the partition pruner, so even a paged read widens
  rather than narrows: the cursor did not prune the *newer* partitions either. Only the two
  queries that already carry a range or an equality on the partition column prune to one.
  Written as specified this spec cannot pass on two of the three tables, and written to pass it
  would assert today's behaviour — every inbox page and every bell count touching every month,
  six today and fourteen once `notifications` retention fills its year.
  The spec is still worth having.
  `corrected: 2026-09-13, measuring S2.9` — **"exactly one `Append` child" is unreachable for
  `list` by any lower bound.** A `created_at >= x` predicate cannot prune a *future* partition:
  rows could legitimately land there. A 30-day floor against the fifteen-partition steady state
  scans **four** — the current month, the one before it, and the two months of runway ahead. One
  is reachable only with a floor *and* a ceiling, which a "newest first" read does not have.
  Write the assertion as a ceiling on partitions scanned, or as "the retention tail is pruned",
  and say which. `markRead`'s equality and the activity rollup's closed range are the two places
  "exactly one" is honest.
  `corrected: 2026-09-14 — decision D22.` Both, and the dependency on `16.14` went with the item.
  **Exactly one** for the reads that carry an equality or a closed range: `markRead` and the
  activity daily rollup. **The retention tail is pruned** for `listUnreadSince` with a one-month
  floor: every partition older than the floor is absent from the plan, which is what a rewrite that
  loses the `created_at >` predicate would break. **Pinned at every partition** for the unbounded
  reads — `list`, `countUnread`, `existsUnread`, `markAllRead`, the outbox drain: the count equals
  the number of partitions that exist. That third assertion asserts today's behaviour on purpose.
  It catches nothing on its own; it is the change detector, so that a bound added later fails the
  spec and is lowered deliberately with decision D22's numbers re-measured, rather than arriving
  as a badge that silently stopped counting old rows.
  `built: 2026-09-18` — the spec walks the two-level layout from `16.3` and carries `16.7`'s first
  assertion for the four tables it covers: **one tenant partition**, proven against a second tenant
  that also holds rows in both months, so it cannot pass on a database with one tenant in it. The
  plan walker intersects
  `EXPLAIN (FORMAT JSON)`'s relation names with `pg_inherits` read fresh on every assertion, so a
  month another spec created or dropped cannot move the answer, and the parent a `ModifyTable` node
  names is never counted as a partition that was scanned. `partitions.md` was written with it —
  `16.10`'s page, plus `data-and-scale.md` §4.2 corrected (the "last 30 days touches one partition"
  bullet was wrong in exactly the way `16.1` measured) and `docs/setup/13` §13.6 pointed at §21.
  The rest of `16.10` waits on `16.2` and `16.3`.

#### The tenant layout — one merge unit

- [x] `16.2` **`messages` is partitioned, and the send dedupe leaves Postgres** `done: 2026-09-18` — decision D26
  (2026-09-15) reverses decision D20: the trigger is not waited for. The blocker was never the
  table, it was one index — `messages_client_uq (organization_id, conversation_id, client_id)`
  cannot exist on a partitioned table without `created_at`, and with it every retry inserts
  (`messaging.md` §"the one table that is not partitioned"). The dedupe moves to the cache:
  `CacheStore` gains `setIfAbsent<T>(key, value, ttlSeconds): Promise<boolean>` — one Redis
  `SET … EX … NX`, mirrored in `InMemoryCacheStore` — and `SendMessageUseCase.execute` generates
  `id = Uuid.v7()` and `createdAt = clock.now()` itself, then before `unitOfWork.run` calls
  `setIfAbsent("message:client:<org>:<conversation>:<clientId>", { id, createdAt }, 86_400)`.
  `false` means a retry: read the held `{ id, createdAt }`, `messages.findById(...)`, and return
  that row without touching the conversation, the outbox or the fast path — the two attempts stay
  indistinguishable, which is what `DO UPDATE … RETURNING` bought. A held key whose row is absent
  (the first attempt's transaction rolled back after the key was set) is deleted and the send
  proceeds as new; that branch is two lines and the spec that pins it is the one worth writing.
  `NewMessage` gains `id` and `createdAt`; `save()` becomes a plain insert with `RETURNING`;
  `client_id` stays as a column, with no index. `Clock` is injected into the use-case, which is
  the first messaging use-case to hold one.
  Schema: `messaging.schema.ts` PK becomes `(id, created_at)` the way `notifications` already is,
  `messages_client_uq` is deleted, `messages_keyset_idx` and `messages_conversation_fk_idx` are
  declared on the parent and propagate. `conversations.last_message_id` carries no FK
  (`messaging.schema.ts:38`), so nothing references `messages` and the table can be replaced.
  `messages.conversation_id → conversations` stays: a partitioned table may hold outbound FKs.
  Migration `0023_tenant_partitions.sql` (`revised: 2026-09-16` — folded into `16.3`'s migration;
  the PK is `(id, organization_id, created_at)`), hand-written: `drop table messages`, then the
  `0000` shape — `create table … partition by range (created_at)` with the PK, the two indexes,
  and six monthly children — **in place, not create-copy-swap**, because the seed writes no
  messages and the kit ships none; the sentence "a deployment with rows copies into a new parent
  and swaps under a lock" goes in `partitions.md`, not in the migration. `22.3` moves to `0024`.
  `PartitionedTable.ALL` gains `{ name: "messages", column: "created_at", retentionMonths: null }`,
  and here `null` keeps its meaning after `17.5`: never dropped by the calendar and therefore
  never archived — messages are domain data — so `17.3` exports nothing for it and Phase 17's loop
  skips it. The `partitions` job still ensures its runway. §21 (`15.4`) then sees a fourth
  `PARTITION BY RANGE ("created_at")` in `migrations/` and requires exactly this entry.
  `16.1` adds the table: **exactly one** for `findById`, `edit`, `softDelete` (`created_at =`);
  **the tail is pruned** for `unreadCounts` (`created_at > last_read_at`, the floor is the read
  marker rather than retention); **pinned at every partition** for `list` — the row-constructor
  cursor is the same shape decision D22 measured, so partitioning `messages` buys a manageable
  table and a ready archive path, not a faster page, and the item says so plainly.
  **Docs:** `messaging.md` §"the one table that is not partitioned" rewritten as "how it is
  partitioned and where the dedupe went" (the two rejected alternatives stay as history; a third,
  the one built, is added); `messaging.schema.ts:87-88` comment; `partitions.md` (`16.10`) fourth
  table and the copy-swap sentence; `docs/setup/27` "Step 6 can refuse" paragraph becomes "Step 6
  refused once, and the answer was a cache key"; `packages/application/docs/reference/ports.md`
  for `setIfAbsent`. `data-and-scale.md` §4.2 names no `messages` today — nothing to change.

- [x] `16.3` **Tenant partitions: the layout** `done: 2026-09-18` — decision D29 (2026-09-16). Seven tenant-owned
  tables become `PARTITION BY LIST (organization_id)`, and under each tenant's partition the three
  with a time column are `PARTITION BY RANGE` again: `activity_log`/`occurred_at`,
  `notifications`/`created_at`, `messages`/`created_at`. `outbox_event` stays month-only (the drain
  polls it once a second and must not touch a thousand partitions to do it); every catalog table is
  untouched. Postgres requires every unique constraint on a partitioned table to carry every
  partition key, which rewrites the primary keys: `notifications` `(id, created_at)`
  (`notification.schema.ts:49`) → `(id, organization_id, created_at)`; `activity_log`
  `(id, occurred_at)` (`activity.schema.ts:29`) → `(id, organization_id, occurred_at)`; `messages`
  `id` (`messaging.schema.ts:92`) → `(id, organization_id, created_at)`; `conversations` `id`
  (`:22`), `conversation_members` `id` (`:54`), `notification_preferences` `id`
  (`notification.schema.ts:82`) and `document_chunks` `id` (`vector.schema.ts:18`) → `(id,
  organization_id)`. Every existing unique index already leads with `organization_id`
  (`notifications_dedupe_uq` also carries `created_at`, because it is the event's `occurred_at`,
  not `now()`); `messages_client_uq` is the one that cannot survive the range level and it goes as
  `16.2` already decided, with the Redis `setIfAbsent` dedupe in its place. Two foreign keys point
  at a table whose primary key now has two columns and must become composite:
  `conversation_members.conversation_id` (`messaging.schema.ts:61-64`) and `messages.conversation_id`
  (`:97-100`) become `foreignKey({ columns: [t.conversationId, t.organizationId], foreignColumns:
  [conversations.id, conversations.organizationId], name })` in the table's third argument, still
  `no action` — `import.ts` gains `foreignKey` from `drizzle-orm/pg-core`, the first composite FK in
  the tree. The nine FKs to catalog tables are unaffected: a partitioned table may reference a plain
  one. `pg-vector.store.ts:57-58` `target: documentChunks.id` → `[documentChunks.id,
  documentChunks.organizationId]`; the insert already supplies the tenant (`:47`).
  `document_chunks_embedding_idx` becomes one HNSW graph per tenant, which is the better shape:
  `search()` carries `organization_id` (`pg-vector.store.ts:107-113`), so a query prunes to one
  small graph instead of walking everyone's. `PartitionedTableEntry` becomes `{ name, tenantKey:
  TenantKey | null, column: PartitionColumn | null, retentionMonths }`, with
  `export type TenantKey = "organization_id"` declared once beside `PartitionColumn`, and `ALL`
  lists eight:

  ```ts
  { name: ACTIVITY_LOG,             tenantKey: "organization_id", column: "occurred_at", retentionMonths: 13 },
  { name: OUTBOX_EVENT,             tenantKey: null,              column: "occurred_at", retentionMonths: 2 },
  { name: NOTIFICATIONS,            tenantKey: "organization_id", column: "created_at",  retentionMonths: 12 },
  { name: MESSAGES,                 tenantKey: "organization_id", column: "created_at",  retentionMonths: null },
  { name: CONVERSATIONS,            tenantKey: "organization_id", column: null,          retentionMonths: null },
  { name: CONVERSATION_MEMBERS,     tenantKey: "organization_id", column: null,          retentionMonths: null },
  { name: NOTIFICATION_PREFERENCES, tenantKey: "organization_id", column: null,          retentionMonths: null },
  { name: DOCUMENT_CHUNKS,          tenantKey: "organization_id", column: null,          retentionMonths: null },
  ```

  `tenantKey: null` means "not split by tenant"; `column: null` means "tenant level only, never
  pruned by the calendar"; `PartitionedTableName` grows to eight. The seed's `for values in`, the
  maintenance gateway's names, the generator (`16.11`) and §21 all read `entry.tenantKey`, so a
  fork sharding by another column edits the alias and its schema and nothing else. Partition names are `<table>_<32hex>` and `<table>_<32hex>_<yyyy>_<mm>`, the
  uuid with hyphens stripped and validated `^[0-9a-f]{32}$` before it reaches `sql.raw` — the
  longest is `notification_preferences_<32>` at 57 of 63 characters. Migration
  `0023_tenant_partitions.sql`, hand-written: drop and recreate the seven tables in place with the
  new keys and both partition levels (the kit ships no rows in them; the sentence "a deployment
  with rows copies into a new parent and swaps under a lock" goes in `partitions.md`), `16.2`'s
  `messages` DDL folded in. The migration creates the partitioned **parents only**. Children — every
  existing tenant's partitions and the runway months — are created by `TenantPartitionSeed`
  (`16.4`), which `migrate.ts` runs for every organization immediately after `migrate()` returns,
  over the same direct connection. One implementation creates partitions everywhere; a SQL copy of
  it in the migration would be a second one that drifts. This migration is a rewrite of seven live
  tables and is hand-written; `16.11`'s generator refuses exactly this case and serves the *next*
  partitioned table a fork adds.
  §21 (`15.4`) extends: an entry with a `tenantKey` must have `PARTITION BY LIST ("<tenantKey>")` in
  `migrations/`, its primary key must name that column and, when `column` is set, that column too. **Docs:** `partitions.md` (`16.10`, the two-level shape and the copy-swap sentence),
  `docs/opinions/data-and-scale.md` §4.2 (a tenant level above the month level, and why the outbox
  is exempt), `docs/ai/rules/data.md` partition bullet, `docs/setup/13` §13.3 and §13.6,
  `messaging.md`, `packages/infrastructure/docs/reference/vector-store.md` (one graph per tenant).

- [x] `16.4` **`TenantPartitionSeed`, and who runs it** `done: 2026-09-18` — a row for an organization with no
  partition is an insert error, so every path that creates an organization creates its partitions
  in the same transaction. `pg/seed/tenant-partition.seed.ts`, the `SystemRoleSeed` shape: `run
  (organizationId)` probes each of the seven with `to_regclass` and, for each missing one, creates
  the child as a standalone table (`create table <name> (like <parent> including all)`, with
  `partition by range (<column>)` for the three time tables) and then
  `alter table <parent> attach partition <name> for values in ('<uuid>')` — never
  `create table … partition of`, which takes an `ACCESS EXCLUSIVE` lock on the parent for the rest
  of the transaction and would stall every read on all seven tables for the length of a signup;
  `attach` takes `SHARE UPDATE EXCLUSIVE`, which blocks nothing a request does, and an empty child
  attaches without a validation scan (`revised: 2026-09-17`). Then the current month and the next
  two under each time table, the same way. Over `this.db` so it joins the caller's transaction —
  DDL through the pooled handle inside a transaction is proven by `pooled.smoke.spec.ts:83,198-203`.
  Callers:
  `migrate.ts`, which after `migrate()` pages `organizations` and runs the seed for each, so a fresh
  migration leaves no parent without children before the web app can take a request;
  `PgOrganizationFounder.found()` — the call goes after the `organizations` insert
  (`pg-organization.founder.ts:47-53`) and before `this.systemRoles.run` (`:57`), because
  `activity.record` at `:75` writes the tenant's first `activity_log` row in this same transaction
  and needs the partition to exist; `seed.ts:46` after its insert; a new `seedTenant(database,
  organizationId)` in `tests/support/database.ts`, called by the four specs that insert
  `organizations` directly (`tests/messaging/pg-conversation.repository.spec.ts:48`,
  `pg-message.repository.spec.ts:63`, `tests/rbac/tenant-cascade.spec.ts:33`,
  `tests/vector/pg-vector.store.spec.ts:125`) and by the two analytics specs that today create a
  month with an ad-hoc `PgMaintenanceGateway` (`pg-activity-archive.gateway.spec.ts:83`,
  `pg-activity-replay.reader.spec.ts:52`). `MaintenanceGateway.ensureTenantPartitions
  (organizationId): Promise<readonly string[]>` on the port delegates to the seed, so the tenant
  move (`24.2`) and the deletion action (`19.20`) reach it through the port; mirrored in
  `RecordingMaintenanceGateway`. No nil-tenant partition: the survey found no writer that can put
  a tenant-owned row under `SystemPrincipal.platform()`'s nil uuid, and `activity_log` having no
  FK is the one place it could start — the seed's comment says so. **Docs:** `partitions.md`,
  `docs/setup/13` §13.4, `ports.md`, `tests/support` mention in `packages/infrastructure/docs/index.md`.

- [x] `16.5` **The maintenance gateway learns two levels** `done: 2026-09-18` — `pg-maintenance.gateway.ts` was
  written for one level and fails silently on two: `childrenOf` (`:131-141`) joins `pg_inherits`
  once and returns the tenant partitions, never the months, and `partitionMonth`'s regex
  `^${table}_(\d{4})_(\d{2})$` (`:166-174`) matches nothing under the new names, so
  `dropMonthlyPartitionsBefore` would parse `null` and skip every partition — retention stops with
  no error. `childrenOf(table, organizationId?)` joins `pg_inherits` twice (parent → tenant → month)
  and `partitionMonth` takes `^${table}_[0-9a-f]{32}_(\d{4})_(\d{2})$`. Signatures gain the tenant:
  `ensureMonthlyPartitions(table, organizationId, from, months)`, `monthlyPartitionsAfter(table,
  organizationId, from)`, `dropMonthlyPartitionsBefore(table, organizationId, cutoff)`,
  `partitionsBefore(table, cutoff, organizationId?)` (`16.8`, the whole-table form for the status
  column), plus `dropTenantPartitions(organizationId): Promise<readonly string[]>` (the seven list
  partitions, months included, in one transaction). `lockFor` stays per table. `outbox_event` keeps
  the single-level path as an `if (!entry.tenantKey)` branch inside the same methods, not a second
  gateway. `MaintenanceConsumer.partitions()` (`maintenance.consumer.ts:118-145`) loops
  `organizations` — a paged `select id` from the catalog, an `OrganizationReader.page()` on the
  slice port — times the three time tables, ensuring runway and pruning per tenant;
  `partition.runway.low` and `maintenance.partitions.ensured` gain `organizationId`. `16.9`'s
  `db:partitions` loops tenants the same way. The per-tenant DDL count per month is tenants × three,
  one statement each, which is what bounds tenants per node before the split. The runway job
  attaches the same way `16.4` does (create standalone, then `attach`; `revised: 2026-09-17`),
  keeps `lock_timeout` short as `14.11` already requires, and paces itself — a bounded number of
  tenants per transaction, one transaction at a time — so a month's worth of tenant DDL is a slow
  background trickle rather than one lock storm on the first of the month. **Docs:**
  `consumers.md`, `schedules.md`, `partitions.md`, `ports.md`.

- [x] `16.6` **The projection goes per tenant** `done: 2026-09-18` — `PgActivityReplayReader.since()`
  (`pg-activity-replay.reader.ts:23-50`) is a global keyset over `activity_log` with no tenant
  predicate, and under a tenant level that is an append over every tenant's month partition per
  batch. It becomes per tenant, which is also the shape `docs/ai/rules/data.md:27` asks for. Ports:
  `AnalyticsProjector.checkpoint(organizationId)` — ClickHouse `max(occurred_at), argMax(id,
  (occurred_at, id)) … where organization_id = {org:UUID}`, cheap under `ORDER BY
  (organization_id, occurred_at, id)`; `ActivityReplayReader.since(organizationId, checkpoint,
  limit, excluding)` and `dailyCounts(organizationId, from, to, excluding)`;
  `AnalyticsProjector.dailyCounts(organizationId, from, to, excluding)`. `AnalyticsConsumer.project()`
  loops organizations (the same paged catalog read `16.5` uses), batches of 5,000 per tenant, a
  per-run cap on total rows in place of `MAX_BATCHES_PER_RUN`, `lagMs` becomes the max over tenants
  of the oldest unprojected row's age, `analytics.projection.completed` gains `tenants`;
  `reconcile()` compares per tenant and `analytics.reconciliation.drifted` gains `organizationId`.
  `activity_log_replay_idx` (`activity.schema.ts:33`) becomes a local `(occurred_at, id)` index on
  each month partition and its "cross-tenant by design" comment is rewritten. Two things dissolve:
  `24.8`'s filed ClickHouse-checkpoint gap (a tenant's checkpoint is keyed on the tenant, and
  ClickHouse is not per node, so a moved tenant resumes where it was), and `22.16`'s projection
  clause (loop tenants, resolve each tenant's node; no per-shard checkpoint). The one remaining
  cross-tenant read on a tenant-owned table, `organizationsWithDigest()`
  (`pg-notification-preference.repository.ts:92-99`), moves to a catalog column
  `organizations.digest_enabled` maintained by the preference write, so the digest schedule reads
  the catalog and never scans partitions. **Docs:** `clickhouse.md` (projection and
  reconciliation sections), `consumers.md`, `docs/ai/rules/data.md` (the exception is gone),
  `notification-policy.md`.
  `built: 2026-09-18` — with one deviation and two things the plan did not name.

  **`activity_log` keeps `retentionMonths: null`.** `16.3`'s listing gives it `13`, which is right
  once Phase 17 makes `prune()` archive-first — today it would make the calendar drop a month the
  archive has not uploaded, which is the exact race the entry's own comment warns about. Set it to
  `13` in `17.5`, in the same change that makes the drop wait for a verified object.

  **`PgActivityArchiveGateway` had to go per tenant, and the plan does not say so.** A month
  partition belongs to one tenant after `16.3`, so `archive(period)` named a table that no longer
  exists. It now takes the tenant, detaches `activity_log_<hex>_<yyyy>_<mm>` off the tenant's
  partition, and writes the object at `activity-archive/<yyyy>/<mm>/<organization_id>.ndjson.gz` —
  which is `17.3`'s "objects cut per tenant", arriving early because `16.3` forced it. `0024` gives
  `activity_archive` an `organization_id` and a composite key; a row written before it carries the
  nil uuid, which marks an object holding every tenant's month rather than naming a tenant.
  `PartitionArchiveGateway` in `17.1` still replaces the port.

  **`OrganizationReader` is a port, not a slice read.** `16.5` calls it "an `OrganizationReader.page()`
  on the slice port" and there is no organization slice; it went to `application/src/port/` under the
  rule `folders.md` gives — a second feature needing tenants adds a method to it, not a file beside
  it. `Container.organizations` binds `PgOrganizationReader`.

  Two assertions moved with the layout: §21 reads `PARTITION BY LIST|RANGE` and the allowlist's two
  keys, checking the outermost level a migration can declare, and §18 learned
  `foreignKey({ columns })` — without which it silently stopped seeing the two composite references
  `16.3` introduced. Both have fixture cases.

  `16.7` is partly done: its first assertion is in `16.1`'s spec for `notifications`, `messages`,
  `activity_log` and `outbox_event`. The four tenant-only tables are still open.

#### The trailing items

- [x] `16.7` **Pruning per tenant, asserted** `done: 2026-09-18` — `16.1`'s `EXPLAIN` spec extends to the seven
  tables with a first assertion that is now true of every read: exactly one tenant partition is
  scanned. Per table: `notifications` `list`, `countUnread`, `existsUnread`, `markRead`,
  `markAllRead` (one tenant; `markRead` one month); `messages` `findById`, `edit`, `softDelete` (one
  tenant, one month), `unreadCounts` (one tenant, the tail from `last_read_at`), `list` (one tenant,
  pinned at that tenant's months — decision D22's finding unchanged, now over a tenant-sized set);
  `conversations` `findById`, `listRecent`, `findDirect` and `conversation_members` reads,
  `notification_preferences` `find`/`upsert`, `document_chunks` `search`, `deleteBySource`,
  `upsert` (one tenant each); `activity_log` `since(organizationId, …)` (one tenant, the months
  after the checkpoint). The assertion form is the ceiling `16.1` already uses: partitions scanned
  ≤ partitions that exist for that tenant, and never another tenant's. **Docs:** `partitions.md`.
  `built: 2026-09-18` — twenty-four cases. The tenant assertion is proven against a *second* tenant
  holding rows in the same months, because on a database with one tenant in it a read that lost its
  predicate passes anyway. `edit` and `softDelete` join the one-month set; `unreadCounts` is left
  out, and deliberately: its floor is `last_read_at`, so the shape it would assert is the tail
  already pinned by `listUnreadSince`, against a correlated subquery whose plan is a different
  argument. Reopen it with `17.6` if the read changes.

  **This item found the bug the phase would otherwise have shipped.** The spec's own cleanup
  exposed that `dropTenantPartitions` used `DROP TABLE … CASCADE`, and a foreign key referencing a
  partitioned table is a constraint on the *parent* — so dropping one tenant took
  `conversation_members_conversation_fk` and `messages_conversation_fk` off the parents for **every**
  tenant, permanently, with nothing but a `NOTICE`. Every later write to either table was unchecked.
  Fixed by detaching and then dropping, and by ordering `PartitionedTable.ALL` so a table is listed
  ahead of the tables that reference it — Postgres refuses to detach a referenced partition while
  rows point into it, so the reverse of that list is the drop order.
  `tests/maintenance/tenant-partition.spec.ts` drops a populated tenant and reads `pg_constraint`
  back; it fails on the old form, which is how it was proved.

  The plan named no spec for `TenantPartitionSeed` or `dropTenantPartitions` at all — `16.4` and
  `16.5` list the code and the docs and no test. That file is now the one, and the gap is worth
  noticing for `17.1`, which replaces the port these methods sit on.

- [x] `16.8` **`MaintenanceGateway.partitionsBefore`, the read behind the retention preview** `done: 2026-09-18` —
  `partitionsBefore(table: PartitionedTableName, cutoff: Date): Promise<readonly PartitionEstimate[]>`,
  `PartitionEstimate { name, period: Date, estimatedRows: number, bytes: number }`, on the port at
  `application/src/port/maintenance.gateway.ts` (an existing port, so the count stays).
  `childrenOf` (`pg-maintenance.gateway.ts:131-141`, private) widens to return the three columns
  and `dropMonthlyPartitionsBefore` keeps reading names off it, so the drop loop and the preview
  cannot disagree about what a child is:

  ```sql
  select child.relname as name,
         greatest(child.reltuples, 0)::bigint as estimated_rows,
         pg_total_relation_size(child.oid)::bigint as bytes
  from pg_inherits
  join pg_class parent on parent.oid = pg_inherits.inhparent
  join pg_class child  on child.oid  = pg_inherits.inhrelid
  where parent.relname = ${table}
  ```

  Filtered in code by `partitionMonth(table, name) < monthStart(cutoff)`, the same parse the drop
  uses. `reltuples` is the planner's estimate, refreshed by autovacuum or `ANALYZE`, and `-1` on a
  child never analysed — hence `greatest(…, 0)`, and the screen says "about". `bytes` is exact.
  `RecordingMaintenanceGateway` (`composition/src/fake/recording-maintenance.gateway.ts`) records
  the call and returns a list its constructor was given, default `[]`. Consumed by
  Phase 19's preview (`19.15`) and its retention screen's "today" column; nothing
  in this plan calls it. Added 2026-09-15. **Docs:** `ports.md`, `partitions.md`.

- [x] `16.9` **`pnpm db:partitions`** `done: 2026-09-18` — `packages/infrastructure/partitions.ts` above `src/`
  (the rule for runnable scripts, `docs/ai/rules/folders.md`): ensures three months for every
  allowlist entry over `DATABASE_DIRECT_URL` and prints the runway per table; root
  `package.json` script. For the operator whose worker is down on the first. **Docs:**
  `docs/ai/rules/workflow.md` command block (written in `14.13`), `docs/setup/13`.
  `built: 2026-09-18` — it loops tenants the way `16.5` does and prints a row per table per tenant.
  `ahead` is read **before** ensuring and is the column that matters: a zero says the next insert
  past month end would have failed, and `created` is what this run had to add. Proved by dropping
  two months by hand and re-running — `ahead 0, created 2`, and the tail line naming how many were
  starved. The script joins both `noProcessEnv` exemption lists, which §3 requires to stay in step.

- [x] `16.10` **Docs** `done: 2026-09-18` — new `packages/infrastructure/docs/reference/partitions.md` (the
  allowlist as the source of truth, the two mechanics — partition key in the PK, drizzle cannot
  express `PARTITION BY` — the boot-time runway, why no `DEFAULT`, the pruning spec, and the
  `messages` exception), registered in `reference/meta.json` and `docs/index.md`;
  `docs/opinions/data-and-scale.md` §4.2 rewritten around the allowlist entry shape;
  `docs/ai/rules/data.md` partition bullet updated; `docs/setup/13` §13.6 hand-edit paragraph
  points at §21.
  `built: 2026-09-18` — all five, and four more the tenant level forced: `partitions.md` carries the
  two-level shape, the seed, the `CASCADE` finding from `16.7`, and `db:partitions`;
  `docs/setup/26` §21 describes both levels; `messaging.md` became "how it is partitioned and where
  the dedupe went"; and `docs/setup/27`'s "Step 6 can refuse" became "refused once, and the answer
  was a cache key".

- [x] `16.11` **The partition DDL generator** `done: 2026-09-18` — adding a partitioned table today is one allowlist
  line and then `PARTITION BY` written by hand, because drizzle cannot express it and its
  snapshots do not know it exists. `packages/infrastructure/partition-ddl.ts`, above `src/` like
  `migrate.ts`, runs as the second half of `db:generate` (`"drizzle-kit generate && tsx partition-ddl.ts"`
  in `packages/infrastructure/package.json`): it opens only the migration the last
  `meta/_journal.json` entry names — the one just generated, never an applied one, because the
  migrator hashes each file's whole text — and for every `CREATE TABLE "<t>"` whose `<t>` is in
  `PartitionedTable.ALL` and whose statement carries no `PARTITION BY` yet, rewrites the closing
  `);` to `) PARTITION BY LIST ("<tenantKey>");` when `tenantKey` is set, or
  `) PARTITION BY RANGE ("<column>");` when only `column` is. It never invents a key: the statement's
  `PRIMARY KEY(…)` must already name the tenant key and, when `column` is set, that column — drizzle
  emits the composite form only when the schema declares `primaryKey({ columns })` — and a
  statement that fails that check stops the run with the message "declare the composite primary
  key in the schema; the generator does not synthesize keys". It creates no children: `16.4`'s
  seed does, at migrate time and at signup, so the migration holds parents only. Idempotent (a
  statement already partitioned is skipped), and it refuses a `<t>` whose `CREATE TABLE` already
  appears unpartitioned in an earlier migration — that is a rewrite of a live table, which is
  `partitions.md`'s copy-swap procedure and a hand-written migration, never a generator's job
  (`16.3`'s own migration is that case). §21 (`15.4`) then checks the other direction: every
  allowlist entry has its `PARTITION BY` in `migrations/`, with the right kind and keys. The two
  together make "add a partitioned table" one allowlist line and one ordinary `db:generate`.
  Spec: a fixture migration through the rewriter, pinned before and after; the refusal on an
  inline `PRIMARY KEY`; the refusal on a live-table conversion. Added 2026-09-16. **Docs:**
  `partitions.md` (the three steps: schema with a composite key, one allowlist line, `db:generate`),
  `docs/setup/13` §13.6 (the hand-edit paragraph becomes "the generator does this; here is what it
  refuses"), `docs/ai/rules/workflow.md` command block (`db:generate` now has two halves),
  `docs/setup/26` (§21 and the generator are the two directions of one check).
  `built: 2026-09-18` — proved end to end rather than only by fixture: a probe table was added to
  the schema and the allowlist, `pnpm db:generate` wrote
  `) PARTITION BY LIST ("organization_id");` onto the statement it had just generated, §21 passed
  against it, and the probe was reverted. Nine cases cover both refusals, the idempotence, and the
  temper against `CREATE TABLE` that stops one statement's match running into the next.

  Two shapes the item did not name. The rewriter is **exported and the runner is guarded** on
  `import.meta.url`, because the plan asks for a spec and every other script above `src/` executes
  on import — that guard is what lets `tests/pg/partition-ddl.spec.ts` import it. And a refusal
  leaves the file `drizzle-kit` already wrote on disk, since the two halves are one `&&`; the
  message says fix the schema and regenerate, and `partitions.md` says so too.

- [ ] `16.12` **The tenant ceiling, measured** — decision D29 says "a few hundred tenants per node is
  comfortable" and nothing in this plan proves it. `packages/infrastructure/tests/smoke/tenant-ceiling.spec.ts`,
  under `pnpm smoke`, gated on `TENANT_CEILING=<n>`: creates `n` synthetic organizations through
  `TenantPartitionSeed` (so `n × 7` tenant partitions and `n × 3 × 3` month children), then times
  three things and prints them as a table — a pruned read on `notifications` for one tenant
  (`EXPLAIN ANALYZE`, planning time and execution time separately), one `partitions` run over every
  tenant (`16.5`), and one `db:migrate` no-op — at `n` = 100, 500 and 2,000. The numbers go into
  `partitions.md` as the ceiling with the date and the Postgres version, and decision D29's "a few
  hundred" is replaced by them. **Reopen `24.7` when** the pruned read's planning time passes 5 ms
  or the runway run passes ten minutes at a tenant count a deployment could plausibly reach. Added
  2026-09-17. **Docs:** `partitions.md`, `docs/opinions/data-and-scale.md` §4.2.

- [x] `16.13` **§15 reads source comments too** `done: 2026-09-18` — `docs/ai/rules/comments.md` tells an author to
  write `// see docs/reference/x.md` and let the page carry the why, and §15 walks only `docs/`,
  so a comment naming a page that was never written passes. Two do today:
  `pg-notification.repository.ts:23` names `docs/reference/notifications.md`, and
  `pg-notification-recipient.reader.ts` names `notification-recipients.md` (`22.10` writes the
  second). §15 additionally walks `//` comments under `packages/*/src` and `apps/*/src` for
  `docs/reference/<name>.md` and resolves each against that package's `docs/reference/`. Same
  assertion number, wider input, so decision D21's count holds. The first reference is fixed by
  writing the page or deleting the sentence — decided when built. **Docs:** `docs/setup/26` §15.
  `built: 2026-09-18` — **five, not two.** The item counted the two missing pages and missed the
  three comments naming a page that exists somewhere else: `api-client` wrote `transports.md` for a
  page called `transport.md`, and two `contracts` files named `docs/reference/messaging.md` for a
  page that lives in `application`.

  Both missing pages had the sentence deleted rather than a page invented: each comment already
  said the whole thing it was pointing away from — the parameter cap on a chunked insert, and the
  correlated `EXISTS` that keeps the recipient query one statement. **`22.10` re-adds the pointer to
  `notification-recipients.md` when it writes that page**, and the assertion is what will hold it to
  writing the page rather than only the sentence.

  One thing the item did not name and the check needs: a source comment resolves against **its own**
  package, unlike a doc span, which resolves against any. That is the difference between "the
  package's `docs/reference/`" spoken generically in an opinions page and a pointer a reader follows
  out of one file. The message offers "name the path" for a page in another package — so the same
  walk now resolves a root-relative path in a comment too, or that fix would be an unchecked escape
  from the rule it is fixing.

#### Dropped

- [-] `16.14` **The reads get a partition bound** `dropped: 2026-09-14` — decision D22 — at the fifteen-partition steady state the unbounded reads cost 0.21–0.87 ms; the measurements stay on `16.1` as the record.

**Exit.** Shared with Phase 17 — the two phases were planned as one and the Exit line under Phase 17 covers both.

---

## Phase 17 — Cold storage: retention stops meaning deletion

Added 2026-09-14. Retention today **destroys** a month — `outbox_event` at two, `notifications` at
twelve — and only `activity_log` survives, because the archive gateway detaches it, streams it to
S3 and verifies the object before dropping. Every item here generalises that one mechanism rather
than building a second.

**Two findings from reading the tree decide the shape, and both are worth knowing before the first
line is written.**

**The archive object is one cross-tenant blob per month.** `objectKey()` is
`activity-archive/<yyyy>/<mm>/activity_log.ndjson.gz`, holding every organization's rows
interleaved and ordered by `(occurred_at, id)`; `check-architecture.mjs:429-432` records that as
intent. Serving one tenant their own old rows out of that shape means downloading and discarding
every other tenant's month, on a user request path. So objects are cut **per tenant** (`17.2`),
which is also the only layout that could ever be handed to a browser as a presigned URL.

**Retention cannot be per-organization.** A partition is the unit of archival *and* of dropping:
`notifications_2026_09` holds every tenant's September. Per-org retention would mean `DELETE`-ing
one tenant's rows out of a shared partition — precisely the bloat-and-vacuum problem partitioning
exists to avoid. The policy is therefore per table, global to every tenant, and it lives on the
allowlist entry (decision D23).

- [ ] `17.1` **One archive gateway for every partitioned table** —
  `ActivityArchiveGateway.archive(period)` becomes
  `PartitionArchiveGateway.archive(table, period): Promise<ArchivedPartition>`; the table comes from
  `PartitionedTableName` and the partition column from `PartitionedTable.byName(table).column`, so
  every `activity_log` and `occurred_at` literal inside the adapter becomes a parameter.
  `PgActivityArchiveGateway` → `PgPartitionArchiveGateway`.
  **This trips the port tripwire twice**: `test-container.spec.ts` counts `application/src/port/*.ts`
  *and* pins a sorted list of twenty-five names, and `TestPorts` / `TestContainer.build` are a
  compile error until the rename lands there too — which is what they are for. Rename
  `RecordingActivityArchiveGateway` with them. The five-step order is untouched and is the
  invariant: detach → stream → record → verify → **then** drop, with `reattach()` (and its
  `inhdetachpending` → `finalize` path, proven in `14.11`) guarding every failure.
  **Docs:** `packages/application/docs/reference/ports.md`, `activity-archive.md` (absorbed by
  `17.7`).
  `corrected: 2026-09-14` — the first text said `ArchivedMonth`, which exists nowhere. The port's
  type is `ArchivedPartition` (`activity-archive.gateway.ts:1-7`, `{ period, key, rowCount }`). The
  name stays and the shape changes with `17.2`: `{ table, period, objects: readonly
  { organizationId, key, rowCount, checksum }[] }`. `RecordingActivityArchiveGateway` returns it
  with an empty `objects`.
  `revised: 2026-09-16` — the archive unit is the tenant-month child `<table>_<org>_<yyyy>_<mm>`
  (decision D29): detach it, stream it as the one object `17.2` already keys per tenant, record,
  verify, drop. The `directDatabase` handle does N detaches per month instead of one, still one at
  a time.

- [ ] `17.2` **Per-tenant objects, and an index that can be read back** — the key becomes
  `cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz`. `cold/` rather than `activity-archive/`
  because one S3 lifecycle rule on that prefix tiers every table to Glacier without naming a
  single object, which is the reason `storage.gateway.ts` fixes a prefix layout at all.
  New table `partition_archive (organization_id, table_name, period, object_key, row_count,
  checksum, archived_at)`, primary key `(organization_id, table_name, period)`. Leading with the
  tenant is not cosmetic: it satisfies §9 and §17 with no exemption, where `activity_archive`
  needed one. **`organization_id` is deliberately not a foreign key**, for the reason
  `activity_log` already gives — an archive record outlives the tenant it names — which is also
  why `17.6` exists rather than a cascade.
  The migration copies any existing `activity_archive` rows under the nil-uuid sentinel (the one
  `SystemPrincipal` already uses for "no tenant") and leaves that table in place; it is dropped in
  a later migration, once no deployment can still hold objects under the old key.
  **Docs:** `docs/setup/13` §13.3, `cold-storage.md` (`17.7`).
  `corrected: 2026-09-14` — the §9 comment this item cites (`check-architecture.mjs:429-432`, "the
  archive object recording it is global") is the premise this section inverts, and the item never
  scheduled its rewrite. It becomes "kept until the drop migration; `partition_archive` leads with
  the tenant and needs no exemption", and the `activity_archive` entry leaves `TENANT_EXEMPT` in
  the migration that drops the table. `partition_archive` is `catalog` (decision D14).
  `revised: 2026-09-15` — `partition_archive` carries three more columns from the migration that
  creates it: `bytes bigint not null`, from `StoredObject.size`, which `s3-storage.gateway.ts:64,101`
  computes and `pg-activity-archive.gateway.ts:74-88` discards today (`ArchivedPartition.objects[]`
  gains `bytes` beside `rowCount`); `action_counts jsonb not null default '{}'`, `{ "<action>": n }`
  counted while the rows stream out, which is free, and what lets the cold reconciliation subtract
  excluded actions and the storage view break a tenant-month down (`activity_log` only; `{}` for
  the other two tables); and `projected_at timestamptz null`, null meaning ClickHouse has not
  received this tenant-month, stamped by `17.5` and read by Phase 20's re-project
  action. Partial index `partition_archive_unprojected_idx (table_name, period) where projected_at
  is null`, so "what has a hole" is an index read rather than a scan (decision D27).

- [ ] `17.3` **The export, cut on the tenant boundary** — `rows()` takes an organization:
  `select distinct organization_id from <partition>` first (cheap — `activity_log`, `outbox_event`
  and `notifications` each carry an index leading with it), then the existing keyset stream per
  org, one `putStream` per object. The detach and the drop stay **once per partition**; only the
  stream/record/verify middle repeats per tenant, so a partial failure still re-attaches the whole
  month and drops nothing. A month with no rows writes no object and records no row — an absent
  `partition_archive` row means "nothing to restore", never "not archived".
  **Docs:** `cold-storage.md`.
  `revised: 2026-09-16` — "detach once per month, stream per tenant" collapses into one loop over
  the tenant-month children of that month (decision D29); an empty child is detached and dropped
  with no object and no row.

- [ ] `17.4` **Restore, proven by a round trip** —
  `restore(table, period, organizationId): Promise<RestoredMonth>` reads the object through
  `storage.get()`, gunzips, and inserts into a **scratch** table named for the month — never
  straight back into the live parent. A restore that re-attaches silently puts archived rows back
  in the hot database and leaves the retention job arguing with itself about them.
  The spec is the item: archive a seeded month, drop it, restore it, and assert the row count and
  a checksum over the sorted ids match what `partition_archive` recorded. **An archive nobody has
  restored is a deletion with extra steps**, and this is the only thing that makes the difference
  checkable rather than asserted.
  `cold.partition.restored` (`info`, `{ table, period, organizationId, rows }`).
  **Docs:** `cold-storage.md`.
  `revised: 2026-09-16` — `restore(table, period, organizationId)` restores one tenant-month child
  into the scratch table; the admin plan's `19.18` attach step attaches it under the tenant's
  LIST partition.

- [ ] `17.5` **`prune()` becomes archive-then-drop, for every table** —
  `MaintenanceConsumer.prune()` archives the month first and drops **only** what was written and
  verified. `RETAIN_MONTHS = 13` disappears into `activity_log`'s `retentionMonths`, which goes
  from `null` to `13` in the same commit — the `null` meant "the archive job owns this", and after
  this item there is no separate archive job — and that removes the last place two retention
  constants could disagree. The `outboxIsBehind` guard
  stays exactly as it is: an unpublished event is never dropped by the calendar, and now it is
  never archived out from under the drain either.
  `maintenance.partition.archived` gains `table` and becomes `{ table, period, objects, rows }` —
  one line per table-month, not one per tenant object, because a month with five thousand tenants
  is five thousand lines; `maintenance.partition.dropped` keeps its name
  and loses its old meaning — after this item it can only ever fire behind a verified object, so
  the catalog comment that calls it "a partition whose rows were never worth keeping" is wrong and
  must be rewritten.
  **Depends on:** `17.1`, `17.2`, `17.3`. **Docs:** `apps/worker/docs/reference/consumers.md`,
  `schedules.md` (the "Retention now drops partitions" heading is no longer true).
  `corrected: 2026-09-14` — the item never said what happens to the `archive` job
  (`maintenance.consumer.ts:82`), `ArchiveSchedule` (`apps/worker/src/schedule/archive.schedule.ts`,
  registered at `worker-bootstrap.ts:94`) and `RETAIN_MONTHS`. All three are deleted: `partitions`
  is the one job and `PartitionsSchedule` the one schedule. The vocabulary table also declared a
  second code, `cold.partition.archived`, for the same event; it is gone, and
  `maintenance.partition.archived` is the one. `event-shape.ts` changes with `core.events.ts`, both
  files, every time. **Docs:** `schedules.md` loses the archive schedule row.
  `revised: 2026-09-15` — after archive-then-drop, for `activity_log` only: when
  `container.hasProjector` and `platformPolicy.get().projectionEnabled` (the switch
  `20.8` builds on `platform_policy`) both hold, read
  `projector.checkpoint()`; if `lastOccurredAt >= period end`, `update partition_archive set
  projected_at = now() where table_name = 'activity_log' and period = $1 and projected_at is null`.
  Otherwise leave it null and emit `analytics.projection.gap` (`warn`,
  `{ period, reason: "disabled" | "behind" }`) — the month is archived and dropped regardless
  (decision D27: archive, drop, record the gap), so a forgotten switch costs a known hole, never an
  unbounded table. The code joins `core.events.ts` **and** `event-shape.ts`.
  `revised: 2026-09-16` — prune runs per tenant-month with
  `retention = tenantOverride ?? retention_policy row ?? allowlist` (`19.19`);
  `outbox_event` keeps the month-only path. The `projected_at` stamp is per tenant-month, which the
  row already is.

- [ ] `17.6` **Deleting a tenant reaches cold storage** — the moment `17.2` lands, deleting an
  organization cascades cleanly through Postgres and leaves every one of its S3 objects behind.
  That is a GDPR-shaped hole and it is created by this phase, so this phase closes it: a
  `MAINTENANCE` job sweeps `partition_archive` for the tenant, `storage.delete()`s each object,
  then removes the rows — in that order, so a crash leaves a row pointing at a deleted object
  (recoverable, re-runnable) rather than an object nothing points at (invisible forever).
  `cold.objects.swept` (`info`, `{ organizationId, objects }`).
  **Depends on:** `17.2`. **Docs:** `cold-storage.md`.
  `corrected: 2026-09-14` — "a `MAINTENANCE` job sweeps" names a job nothing enqueues: no
  organization-delete use-case exists in `packages/` (only specs delete a tenant, through
  `database.client`). The job is `sweep-cold`, enqueued by whatever deletes a tenant once that
  exists, and until then run by an operator: `pnpm db:partitions --sweep <organization_id>`, one
  flag on the script `16.9` builds. The whole-plan check at the bottom of this file runs it that
  way. One sentence in `cold-storage.md` says a future delete use-case must enqueue it.
  `revised: 2026-09-16` — the trigger exists: `19.20` deletes a tenant,
  and the `retention` job sweeps `partition_archive` rows whose organization no longer exists
  once `archived_at` is thirty days old. The `--sweep` flag stays for the operator.

- [ ] `17.7` **Docs** — new `packages/infrastructure/docs/reference/cold-storage.md`: the
  sequenced invariant and why the order is the job, the per-tenant key and the lifecycle rule,
  `partition_archive` as the index a read starts from, restore, and the two findings above.
  Registered in `reference/meta.json` and named from `docs/index.md`.
  Rewrites, each of which currently states that retention deletes: `activity-archive.md`
  (absorbed), `apps/worker/docs/reference/consumers.md` (the "archive reach-back 13 months" row),
  `schedules.md` (the retention heading and both paragraphs under it),
  `docs/opinions/data-and-scale.md` §4.2 and the "dropped after twelve months" paragraph,
  `docs/ai/rules/data.md`, `docs/setup/13` §13.6, and
  `packages/infrastructure/docs/reference/clickhouse.md` (the replay source key changes shape).

- [-] `17.8` **Retention as data, not as a deploy** `dropped: 2026-09-14` — decision D23 — reopened the same day as `19.3`–`19.7`, where the row gets an editor.

**Exit (Phases 16 and 17 together).** `pnpm check:architecture` is 21/21 with §21 passing on the twenty-two existing
migrations; removing `notifications` from `PartitionedTable.ALL` fails §21; starting the worker
against a database whose future partitions were dropped by hand recreates them and prints nothing;
dropping them down to one future month prints `partition.runway.low`; `partition-pruning.spec.ts`
is green against the reads as they are (decision D22);
`pnpm db:partitions` prints three tables with their runway. No partitioned table is dropped without a
verified object behind it: archive a seeded month per table, confirm one object per organization in
MinIO, confirm the `partition_archive` rows, restore one and watch the row count and id checksum
match. `pnpm db:partitions --sweep <organization_id>` on a deleted seeded organization leaves no
object of its behind. A new organization's partitions exist the instant its row does, in the same
transaction; a spec inserting a tenant-owned row for an organization with no partitions fails
with the Postgres error, never silently; `EXPLAIN` on every tenant-owned read shows one tenant
partition; the projection and the reconcile report per tenant (`16.3`–`16.7`). A signup running
while another connection reads `notifications` never makes that read wait on the signup's lock
(`16.4`); `TENANT_CEILING=500 pnpm smoke` prints the three timings (`16.12`).

---

---

## Phase 18 — The platform tier, on RBAC

**Goal.** A user holding `platform.*` keys through a role in the platform organization sees
`/platform` from any tenant; a tenant owner does not, cannot grant a platform key, and cannot see
one in the role editor; the first admin is seeded by a script; every surface that reads
capabilities carries the third axis; `check:architecture` stays green.

**Design in one paragraph.** `PermissionScope` gains `"platform"`; `CapabilitySetDto` gains
`platform: ScopedSetDto` and `can()` gains the explicit branch decision D31 describes.
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

#### Background

**Context.**

The scaling plan chose to keep retention as a constant on `PartitionedTable.ALL` (its decision D23)
and deferred two items — `17.8`, retention as a row an operator edits, and `21.6`, the platform
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

A second pass on 2026-09-15 read the plan against the question "what can the admin choose, and is
there anything more", and found four controls it did not build and one switch it did not have. It
planned every switch that can open a hole in ClickHouse and no action that fills one — nothing in
the repository reads a cold-storage object back. Lowering a retention number silently scheduled a
mass drop with no preview. Cost per tenant was not computable, because the S3 adapter computes
every object's size and the archive gateway discards it. There was no projection on/off switch,
and adding one made a latent gap — an archived month the projection never read — reachable by a
click. And the daily reconcile never read the archived row counts, despite the schema comment
saying that is the only check covering the cold window. Two things from that pass went to the
scaling plan instead: `messages` is partitioned now (`16.2`), and `16.8` adds the partition-estimate
read the preview here consumes. Queue-job retention was checked and is already capped, so it is
not filed.

On 2026-09-16 the scaling plan's shard became the organization and its tenant became a partition
(its decisions D28 and D29). Three things follow here: retention can now differ per tenant, so the
screen gains an override row (`19.19`); a tenant can now be deleted as seven partition drops and a
catalog cascade, so deletion becomes a platform action (`19.20`); and the shard map is one row per
node with tenants underneath, because there is no longer a 256-row grid to show.

**What the admin changes, and what stays a file.**

| Change | Where | Why there |
|---|---|---|
| Which tables are split by tenant, by month, or both | one line in `packages/application/src/primitive/partitioned-table.ts`, then `db:generate` (`16.3`, `16.11`) | table structure |
| Which tables are shared versus per-tenant | the catalog list (`22.1`) | structure |
| What the shard key is | the `TenantKey` alias and one strategy class (`22.21`'s four-edit recipe) | one place, replaced whole |
| How long each table keeps data | `/platform/retention` (`19.3`) | a number |
| How long one tenant keeps data | the tenant row (`19.19`) | a number |
| Which server a tenant lives on | the shard map, once the split exists (`25.4`, `25.5`) | one directory row |
| Whether ClickHouse is on, what reaches it, for how long | `/platform/analytics` (`20.1`, `20.8`) | switches and numbers |
| Restore, re-project, delete a tenant | the screens (`19.18`, `20.10`, `19.20`) | actions over structure |

**Deliberate constants.** The runway of two future months, the projection cadence of five minutes
and its ten-minute lag alarm, the daily and monthly cron times, batch sizes, cache TTLs, and the
thirty-day grace before a deleted tenant's cold objects are swept. Each is a code constant with its
reason beside it. Two of them — the runway and the grace — are policy-shaped and could move onto
`platform_policy` in an afternoon if an operator asks; none of the others should, because a screen
that edits a cron pattern has to re-register every repeatable job, and there is no user for it.

**What exists and is reused.**

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
  three queries decision D35 puts one list in front of.
- `MaintenanceConsumer` and its schedules — the daily reconcile joins the `cleanup` cadence.
- `docs/ai/skills/add-slice.md` — the twelve steps; Phases 19 and 20 are each one slice.
- `StoredObject.size` — computed by the S3 adapter on every put and discarded by the archive
  gateway; the scaling plan's `17.2` keeps it from 2026-09-15.
- `PgActivityReplayReader.subjectOf` — becomes `ActivitySubject.of` in `application/src/primitive/`,
  shared by the replay reader and the re-project sink.
- `PgMaintenanceGateway.childrenOf` — private today; `16.8` widens it and builds the public read beside it.
- `Container.health()` and its `analytics: boolean | null` — the "not configured" state already
  exists as a value.
- The scaling plan's `ColdArchiveReader` port and `17.4`'s scratch-table restore; `21.1`'s ~8 MB
  bound and its streaming escape hatch.

**Vocabulary fixed up front.**

| Thing | Name |
|---|---|
| Scope | `platform`, on `PermissionScope` and on `roles.scope` |
| Column | `organizations.is_platform boolean not null default false`, `organizations_platform_uq` partial on `(is_platform) where is_platform` |
| System role (platform org only) | `platform_admin`, `is_system`, `scope = 'platform'`, every `platform.*` key |
| Permission keys (`packages/permissions/src/catalog/platform.permissions.ts`, module `platform`, scope `platform`) | `platform.status.read`, `platform.retention.read`, `platform.retention.manage`, `platform.analytics.read`, `platform.analytics.manage`, `platform.storage.read`, `platform.shards.read`, `platform.shards.manage` (procedure with `24.2`), `platform.tenant.manage` (`19.20`); `platform.replica.manage` arrives with `24.3`. Restore-to-Postgres is under `platform.retention.manage`; re-project and the switch under `platform.analytics.manage` |
| Routes (`route/platform.routes.ts`) | `/platform/status`, `/platform/retention`, `/platform/analytics`, `/platform/storage`, `/platform/shards` |
| Gate (`gate/platform.gate.ts`) | `platform: { permission: "platform.status.read", route: ROUTES.platform.status }` |
| Tables (catalog, tenant-exempt) | `retention_policy (store, table_name) pk`, `projection_policy (action) pk`, `platform_policy (id smallint pk, check (id = 1))`; `partition_archive` gains `bytes`, `action_counts`, `projected_at` in the scaling plan's `17.2`. Not exempt, because it leads with the tenant: `tenant_retention_policy (organization_id, table_name) pk` (`19.19`) |
| Primitive | `application/src/primitive/activity-subject.ts` → `ActivitySubject.of(payload)`, lifted out of `PgActivityReplayReader` |
| Action catalog (`packages/contracts/src/catalog/`) | `<slice>.actions.ts` fragments → `ACTIVITY_ACTIONS`; `ActivityAction`, `ActivityActions.isKnown` in `registry/` |
| Application slice `platform/` | `retention-policy.repository.ts`, `projection-policy.repository.ts`, `platform.reader.ts` (ports); `retention.rules.ts`; `list-retention-policies`, `update-retention-policy`, `list-projection-policies`, `update-projection-policy`, `inspect-platform-status` use-cases; second pass: `platform-policy.repository.ts` (port); `preview-retention-change`, `list-tenant-storage`, `restore-partition`, `reproject-partition`, `toggle-projection`, `inspect-shard-map` use-cases, `move-tenant` with `24.2`, `toggle-replica-reads` with `24.3`; third pass: `tenant-retention-policy.repository.ts` (port), `update-tenant-retention`, `delete-organization` use-cases |
| Cross-cutting port | `application/src/port/storage-policy.gateway.ts` → `StoragePolicyGateway { lifecycle(), applyLifecycle(rules) }`, `LifecycleRule { prefix, expireAfterDays }` |
| Infrastructure | `pg/schema/platform.schema.ts`, `pg/repository/pg-retention-policy.repository.ts`, `pg-projection-policy.repository.ts`, `pg-platform.reader.ts`, `pg-platform-policy.repository.ts`, `pg/seed/platform-role.seed.ts`, `s3/s3-storage-policy.gateway.ts`; scripts above `src/`: `platform-grant.ts`, `clickhouse-migrate.ts`, `clickhouse-migrations/` |
| Cache prefix | `capability:platform:<userId>`, 60 s, `invalidatePlatform()` on the invalidator |
| Content namespace | `platform` |
| Query keys | `QueryKeys.platform.status()`, `.retention()`, `.retentionPreview(table, months)`, `.projection()`, `.policy()`, `.storage()`, `.shards()` |
| Worker jobs | `retention` on `QueueName.MAINTENANCE`, daily at 03:30, `RetentionSchedule`; `cold-restore` and `cold-reproject` on `MAINTENANCE`, enqueued by use-cases with `jobId: "<job>:<table>:<period>:<org|all>"` so a double click is one job |
| Log event codes | `retention.lifecycle.applied` (info), `retention.lifecycle.drifted` (warn), `retention.rows.expired` (info), `analytics.retention.applied` (info), `cold.partition.reprojected` (info, `{ period, organizationId, rows }`); `analytics.projection.gap` (warn) is declared in the scaling plan's `17.5` and `cold.partition.restored` in its `17.4`. `platform.policy.changed`, `platform.projection.paused`, `platform.projection.resumed`, `platform.restore.requested`, `platform.reproject.requested`, `platform.tenant.move_requested`, `tenant.retention.changed`, `tenant.deleted`, `tenant.export_requested` are **activities**, not log codes; `cold.objects.swept` gains `reason: "tenant_deleted"` (`19.20`); `cold.tenant.exported` (info, `19.21`) |
| Scripts | `pnpm platform:grant <email>`, `pnpm ch:migrate`; `pnpm db:generate` has two halves after the scaling plan's `16.11` |
| Docs pages (new) | `packages/permissions/docs/reference/platform-scope.md`, `packages/application/docs/reference/platform.md`, `packages/infrastructure/docs/reference/clickhouse-migrations.md`, `packages/infrastructure/docs/reference/storage-policy.md`, `packages/infrastructure/docs/reference/cold-restore.md` |

---

#### The scope (`permissions`, `application`)

- [ ] `18.1` **Third scope** — `permission-registry.ts` `PermissionScope = "org" | "goal" | "platform"`;
  `PermissionRegistry.byScope(scope)` beside `byModule`, so the seed and the matrix can exclude by
  scope rather than by module name. `capability-set.ts`: `CapabilitySetDto.platform: ScopedSetDto`
  (`from()` treats a missing axis as empty, so a stale cached DTO degrades to "no platform rights"
  rather than throwing), `platformSet`, and the branch in `can()`: `scope === "platform"` → deny if
  platform denies, grant if platform grants, else `false`; `wildcard` and `isCore` are not
  consulted. `intersect()` sets `platform` to empty. `empty()` includes it. Spec: the four leak
  paths from decision D31, each as a case that fails without the branch. **Docs:** new
  `packages/permissions/docs/reference/platform-scope.md` (registered in `reference/meta.json` and
  `docs/index.md`), `docs/opinions/vocabulary.md` scope row, `docs/ai/rules/vocabulary.md` qualifier line.

- [ ] `18.2` **Keys, routes, gate** — `catalog/platform.permissions.ts` with the nine keys from the
  vocabulary (`platform.shards.manage` is registered now so the seed grants it; its procedure
  arrives with `24.2`), spread into `CATALOG`; `route/platform.routes.ts`; `gate/platform.gate.ts` gating the
  `platform` nav module on `platform.status.read`. `ModuleRegistry.isVisible` needs no change: it
  calls `can()` and the new branch answers. **Docs:** `packages/permissions/docs/index.md` tree.

- [ ] `18.3` **`Principal` carries nothing new; the audit rebase is a rule, not a field** —
  `application/src/platform/platform.reader.ts`: `PlatformReader.organizationId(): Promise<OrganizationId>`
  (throws `InternalError` if no organization is marked — the seed guarantees one). Platform use-cases
  call `activity.record(new Principal(platformOrganizationId, actor.userId, actor.capabilities, actor.kind), …)`
  with the comment from decision D38. **Docs:** `packages/application/docs/reference/platform.md` (new).

#### Resolution and cache (`infrastructure`, `auth`)

- [ ] `18.4` **`organizations.is_platform`** — `rbac.schema.ts` gains the column and the partial unique
  index; `roles.scope` enum gains `"platform"`; migration generated then hand-checked (§20: a
  `boolean not null default false` is safe on a populated table). `seed.ts` marks the `loadbearing`
  organization `is_platform = true` after creating it. **Docs:** `docs/setup/13` §13.3, `docs/opinions/vocabulary.md` table list.

- [ ] `18.5` **`PgCapabilityRepository.resolvePlatformFor(userId)`** — one query for grants
  (`memberships ⋈ roles ⋈ role_permissions` where `organizations.is_platform`, `deactivated_at is null`)
  and one for overrides, filtered in code to `scopeOf(key) === "platform"` after `isKnown`. The port
  `CapabilityRepository` gains the method. `CapabilityCache.platformFor(userId)` under
  `capability:platform:<userId>`, 60 s; `CapabilityInvalidator.invalidatePlatform()` deletes the
  prefix, and every RBAC write use-case calls it **when the actor's organization is the platform one**
  (a role edit in a customer tenant cannot change a platform grant). **Docs:** the capability page
  under `packages/auth/docs/reference/`, `docs/setup/16`.

- [ ] `18.6` **`PrincipalBuilder` merges** — after `memberships.isActive`, `capabilities.forUser` and
  `capabilities.platformFor` run in parallel and the principal is built from the merged DTO. The
  API-key branch and `SystemPrincipal.platform()`/`forOrganization()` pass an empty platform set
  explicitly. `session.fn.ts` ships the merged `toJSON()`, so the router context and `SessionProvider`
  carry it with no change. **Docs:** `apps/web/docs/reference/enforcement-surfaces.md` (the DTO now
  has three axes; the surface count does not grow).

- [ ] `18.7` **The wire DTO** — `role.contract.ts` `capabilities` schema gains `platform: scopedSet`
  (the contract restates the DTO on purpose; it must be restated here too). `packages/query`'s
  session snapshot type follows from the contract. **Docs:** `packages/contracts/docs/index.md`.

#### Seeds, the first admin, the matrix (`infrastructure`, `feature`, `application`)

- [ ] `18.8` **`owner: "all"` stops at the tenant** — `SystemRoleSeed` resolves `"all"` as
  `PermissionRegistry.instance.all().filter(scope !== "platform")`, with the comment that a tenant
  owner is not a platform admin. `reconcile()` therefore removes any platform key a tenant `owner`
  might hold from an earlier deploy. Spec pins it. **Docs:** `docs/setup/13` §13.4 seed paragraph.

- [ ] `18.9` **`PlatformRoleSeed`** — `pg/seed/platform-role.seed.ts`, same idempotent shape as
  `SystemRoleSeed`, runs only for the organization where `is_platform`: one role `platform_admin`,
  `is_system`, `scope = 'platform'`, holding `PermissionRegistry.instance.byScope("platform")`,
  reconciled on every seed so a new platform key reaches admins on the next deploy. `seed.ts` calls
  it after marking the organization. `RoleRules.RESERVED_KEYS` gains `platform_admin`. **Docs:** `docs/setup/13` §13.4.

- [ ] `18.10` **`pnpm platform:grant <email>`** — `packages/infrastructure/platform-grant.ts` above
  `src/` (the rule for runnable scripts), over `DATABASE_DIRECT_URL ?? DATABASE_URL`: find the user by
  email, find the platform organization and its `platform_admin` role, upsert the membership
  (insert, or change the role if already a member), print what it did. Root `package.json` script.
  The only way the first platform admin exists; the members screen is the way every later one does.
  **Docs:** `docs/ai/rules/workflow.md` command block, `docs/setup/13` §13.5.

- [ ] `18.11` **The tenant role editor cannot see platform keys** — `PermissionMatrix` takes an
  `excludeScopes` prop; `RoleMatrix` passes `["platform"]` unless the session's active organization is
  the platform one (the SSR snapshot gains `isPlatformOrganization: boolean`, read off `organizations`
  by `session.fn.ts`). The grant use-case already refuses a key the granter does not hold; this item
  removes the checkbox that would have produced the 403. **Docs:** `packages/feature/docs/index.md`.

- [ ] `18.12` **`/platform/status`, the proof page** — `packages/application/src/platform/inspect-platform-status.use-case.ts`
  (`authorizer.assert(actor, "platform.status.read")`, returns `Container.health()`'s report plus the
  platform organization's id and name); contract `platform.status` + `catalog/platform.permissions.ts`
  entry + `platform.router.ts` + `contract.platform` + `appRouter.platform` (one commit, rule 5);
  `PlatformQueries.status`; `feature/src/platform/platform-status.panel.tsx`; route
  `(app)/_authenticated/platform/status.tsx` copied from `settings/roles.tsx` with
  `RouteGuard.requirePermission("platform.status.read")`; content namespace `platform` (the three
  edits in `namespace.ts`, two lines in `catalog.ts`, `en/platform.ts`, `bn/platform.ts`); nav item
  in the content nav list. The page also shows the projection's three states read-only —
  `health().analytics === null` is "not configured", otherwise `platform_policy` (`20.8`) says on
  or off — while the control itself lives on `/platform/analytics`. **Docs:**
  `apps/web/docs/reference/enforcement-surfaces.md` gains nothing new,
  `packages/content/docs/reference/namespace.md`.

- [ ] `18.13` **§9 and the tripwires** — `check-architecture.mjs` §9 needs no change in this phase
  (no new table); `test-container.spec.ts` needs no change (no new cross-cutting port). Note both
  here so Phase 19 does not forget they exist. `docs/ai/skills/add-slice.md` step 1 gains "scope is
  `org` unless the slice is platform-wide, and then it is `platform` and its keys never reach a
  tenant role".

- [ ] `18.14` **Docs** — `docs/opinions/data-and-scale.md` §1: the super-admin dashboard now has a
  tier and this file is where it lands; `platform-scope.md` (`18.1`): the three axes, the four leak
  paths and what closes each, the platform organization, the seed script, why not an env list.

**Exit.** `pnpm db:seed` marks `loadbearing` platform and seeds `platform_admin`;
`pnpm platform:grant alice@example.test` prints the membership; signed in as alice with a customer
tenant active, `/platform/status` renders and the nav shows the module; signed in as a tenant owner,
`/platform/status` redirects to `/forbidden` and the role editor shows no `platform` module;
a tenant owner calling `role.grant` with a platform key gets `FORBIDDEN`; the capability spec fails
each of decision D31's four leak paths with the branch removed; `pnpm check:architecture` 20/20 and
every suite green.

---

---

## Phase 19 — Retention: hot months, cold months, cold mode, and the ClickHouse TTL

**Depends on:** Phase 18's Exit, and Phase 17 (`17.1`–`17.7`) built.

**Goal.** One screen lists every partitioned table with its hot months, cold months and cold mode,
and the ClickHouse table with its TTL; a change is a row, audited, applied by the worker on its
next run and by the bucket and ClickHouse immediately after commit; an empty table behaves exactly
as the code defaults do; the bucket's lifecycle configuration is always derivable from the rows.

**Design in one paragraph.** `retention_policy (store, table_name, hot_months, cold_months,
cold_mode, updated_at)` with `store in ('postgres','clickhouse')`. `RetentionRules` is the pure
composer: `lifecycleFor(rows)` returns one `LifecycleRule` per postgres table with a `cold_months`,
prefix `cold/<table>/`, `expireAfterDays = ceil(months × 30.44)`; `clickhouseTtlFor(row, perAction)`
returns the TTL expression Phase 20 extends. `UpdateRetentionPolicyUseCase` asserts
`platform.retention.manage`, validates against `PartitionedTable.NAMES` (never a free name,
decision D37), writes the row and the audit inside `unitOfWork.run`, then **after commit** calls
`storagePolicy.applyLifecycle(RetentionRules.lifecycleFor(all rows))` and, for the clickhouse row,
`projector.applyRetention(...)`. A daily `retention` job in `MaintenanceConsumer` recomputes both,
reads back what the bucket and `system.tables` hold, applies on difference, emits `drifted` when the
row and the store disagreed, and deletes `partition_archive` rows whose period is older than the
table's cold months — an expired object with a row still pointing at it is a `NotFoundError` on the
archived-notifications read. `prune()` reads `hot_months` from the row and falls back to
`retentionMonths`; `cold_mode = 'drop'` skips the archive step for that table.

#### ClickHouse can change (`infrastructure`, `infra`)

- [ ] `19.1` **Migration path** — `packages/infrastructure/clickhouse-migrations/0000_activity_events.sql`
  is `infra/clickhouse.init.sql` moved. `packages/infrastructure/clickhouse-migrate.ts` above `src/`
  creates `schema_migrations (version UInt32, name String, applied_at DateTime) ENGINE = MergeTree ORDER BY version`
  if absent, then applies every file whose version is not in it, in order, one `command()` per
  statement. `pnpm ch:migrate` at the root, a no-op with a printed sentence when `CLICKHOUSE_URL` is
  unset. Compose stops mounting the init file; `docs/setup/11` and `docs/setup/15` say
  `pnpm ch:migrate` is the step. `check-architecture` §15 sees the moved path. **Docs:** new
  `packages/infrastructure/docs/reference/clickhouse-migrations.md` (registered), `clickhouse.md`
  gains "how the schema changes", `docs/infra/reference/clickhouse.md`, `docs/ai/rules/workflow.md`
  command block.

- [ ] `19.2` **`AnalyticsProjector.applyRetention` and `retention()`** — the port gains
  `retention(): Promise<string>` (the current TTL expression read from `system.tables.engine_full`,
  normalised) and `applyRetention(expression): Promise<void>` (`ALTER TABLE … MODIFY TTL`, one
  `command()`). `MODIFY TTL` materialises on existing parts, which is a rewrite; the caller compares
  first and applies only on difference, which is why `retention()` exists. **Docs:** `clickhouse.md`,
  `packages/application/docs/reference/ports.md`.

#### The slice (`application`, `infrastructure`, `contracts`, `composition`)

- [ ] `19.3` **Schema** — `pg/schema/platform.schema.ts`: `retention_policy` as above, primary key
  `(store, table_name)`, `check` constraints on `store` and `cold_mode`, `hot_months >= 1`,
  `cold_months >= 0` or null. Global, so a `TENANT_EXEMPT` line in §9 with the comment: a partition
  spans every tenant, so a per-tenant retention row would describe something the storage engine
  cannot do. Migration generated. **Docs:** `docs/setup/13` §13.3, `docs/setup/26` §9 entry.

- [ ] `19.4` **Port and adapter** — `application/src/platform/retention-policy.repository.ts`
  (`all()`, `findBy(store, table)`, `save(row)`); `pg-retention-policy.repository.ts`, `catalog`
  placement once `22.6` lands (until then, the ordinary base constructor). `PlatformReader` (`18.3`)
  gets its `PgPlatformReader`. **Docs:** `platform.md`.

- [ ] `19.5` **`StoragePolicyGateway`** — `application/src/port/storage-policy.gateway.ts`:
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

- [ ] `19.6` **`RetentionRules`** — `application/src/platform/retention.rules.ts`, pure:
  `lifecycleFor(rows)` (one rule per postgres row with a non-null `cold_months`, sorted by prefix so
  two runs compare equal), `clickhouseTtlFor(defaultMonths, perAction)` (Phase 20 fills `perAction`;
  here it is `[]` and the expression is `toDateTime(occurred_at) + INTERVAL <n> MONTH`),
  `daysFor(months) = Math.ceil(months * 30.44)` with the comment that S3 counts days and the screen
  says "about". Unit spec with pinned expressions. **Docs:** `platform.md`.

- [ ] `19.7` **Use-cases** — `list-retention-policies.use-case.ts` (`platform.retention.read`;
  returns every `PartitionedTable.ALL` entry joined to its row or the default, plus the clickhouse
  row or `ActivityEvents.DEFAULT_TTL_MONTHS = 60`, plus what the bucket and ClickHouse currently
  hold so the screen can show drift) and `update-retention-policy.use-case.ts`
  (`platform.retention.manage`; input `{ store, tableName, hotMonths, coldMonths, coldMode }`;
  `tableName` validated against `PartitionedTable.NAMES` or `"activity_events"`; the write and the
  `platform.policy.changed` audit — rebased per decision D38 — inside `unitOfWork.run`; the two
  `apply*` calls after it, failures logged as `retention.lifecycle.drifted` / not rethrown, because
  the row is the truth and the daily job closes the gap). **Docs:** `platform.md`.

- [ ] `19.8` **Contract, procedures, permissions, router** — `contracts/src/platform/platform.contract.ts`
  (`retentionEntity`, `retentionUpdate`), `platform.procedures.ts` (`retention.list` GET
  `/platform/retention`, `retention.update` PUT `/platform/retention`), `catalog/platform.permissions.ts`
  entries, `platform.router.ts` handlers. **Docs:** `packages/contracts/docs/index.md`.

- [ ] `19.9` **Container** — `container.platform = { status, listRetention, updateRetention }`;
  `storagePolicy` port on the container and on `TestPorts`; the repositories built like every other.
  **Docs:** `packages/composition/docs/reference/container.md`.

#### The worker applies it (`worker`)

- [ ] `19.10` **`prune()` reads the row** — `MaintenanceConsumer.prune(table)`: hot months from
  `retentionPolicies.findBy("postgres", table)?.hotMonths ?? entry.retentionMonths`; `cold_mode`
  `'drop'` skips the archive step and drops directly (the `outboxIsBehind` guard stays regardless).
  **Docs:** `apps/worker/docs/reference/consumers.md`.

- [ ] `19.11` **The `retention` job** — daily 03:30, `RetentionSchedule`, job `retention` on
  `MAINTENANCE`: compose the lifecycle from rows, read the bucket's, apply on difference and emit
  `retention.lifecycle.applied { rules }` or `retention.lifecycle.drifted { expected, actual }` first;
  same for the ClickHouse TTL via `projector.retention()` / `applyRetention()`,
  `analytics.retention.applied`; then delete `partition_archive` rows older than each table's cold
  months, `retention.rows.expired { table, rows }`. All four codes join `core.events.ts` **and**
  `event-shape.ts`. **Docs:** `apps/worker/docs/reference/schedules.md`, `docs/setup/09b` code table.

#### The screen (`query`, `feature`, `content`, `web`)

- [ ] `19.12` **Query and mutation** — `PlatformQueries.retention(client)` (`staleTime` 60 s),
  `PlatformMutations.useUpdateRetention(client)` invalidating `QueryKeys.platform.retention()`; no
  optimistic update, for the reason `useUpdatePreference` gives. **Docs:** `packages/query/docs/index.md`.

- [ ] `19.13` **`retention-policy.form.tsx`** — one `fieldset` per table: hot months (number),
  cold months (number, blank = never expires), cold mode (two buttons, `archive` / `drop`, the
  `MODES` shape from the notification form); the ClickHouse row shows months only. Beside each row,
  what the store currently holds, and a `Callout tone="warning"` when it differs. A second callout
  on the `drop` mode: a dropped month is not in cold storage and cannot be restored. `apps/web`
  route `platform/retention.tsx` from `roles.tsx`, read gate on the route,
  `<Can permission="platform.retention.manage">` around the editor. Copy in `en/platform.ts` and
  `bn/platform.ts`. **Docs:** `packages/feature/docs/index.md`.

- [ ] `19.14` **Docs** — `docs/opinions/data-and-scale.md` §4.2's closing paragraph ("decide the
  retention policy at the same time") gains "and it is a row, with the allowlist as the default";
  `docs/ai/rules/data.md` retention bullet; `packages/infrastructure/docs/reference/cold-storage.md`
  (from `17.7`) gains the lifecycle section; `17.8` marked moved here.

- [ ] `19.15` **Preview before a retention change** — depends on the scaling plan's `16.8`.
  `preview-retention-change.use-case.ts` (`platform.retention.read`; input `{ tableName, hotMonths }`,
  `tableName` from `PartitionedTable.NAMES`; computes the cutoff the way `prune()` does and returns
  `maintenance.partitionsBefore(table, cutoff)` — `{ name, period, estimatedRows, bytes }[]` — plus
  totals). Procedure `retention.preview` GET `/platform/retention/preview`, the permission entry,
  the router, `PlatformQueries.retentionPreview` (`staleTime: 0`). `retention-policy.form.tsx`: the
  hot-months field calls the preview on change, debounced 300 ms; the row shows "the next run drops
  N partitions, about R rows, B" with a `Callout tone="danger"` when N > 0, and **the save button is
  disabled until a preview for the current value has loaded**. The screen says rows are an estimate
  refreshed by autovacuum. The same read with a cutoff past the runway gives each table its
  "partitions / rows / bytes today" column, `messages` included, read-only (decision D47).
  **Docs:** `platform.md`, `packages/feature/docs/index.md`.

- [ ] `19.16` **Per-tenant storage** — depends on `17.2`'s `bytes` and `action_counts`.
  `list-tenant-storage.use-case.ts` (`platform.storage.read`; `partition_archive` grouped by
  `organization_id, table_name`: `sum(bytes)`, `sum(row_count)`, months covered, joined to
  `organizations.name`; sorted by bytes descending; paginated; an optional `organizationId` filter
  that also returns the per-month rows and the per-action breakdown from `action_counts`).
  Procedure `storage.list`, route `/platform/storage`, `tenant-storage.list.tsx` over `DataTable`.
  The screen says **cold storage only**: hot Postgres bytes cannot be attributed to a tenant because
  a partition mixes every tenant's rows, and hot bytes per *table* are on the retention screen
  (`19.15`). **Docs:** `platform.md`, `cold-storage.md`.

- [ ] `19.17` **The cold reader, pulled forward from `21.1`** — the scaling plan's `ColdArchiveReader`
  (`application/src/port/`, `S3ColdArchiveReader` in `infrastructure/src/s3/`) is built here, with
  a bulk method first: `rows(entry: PartitionArchiveEntry): Promise<readonly Readonly<Record<string, unknown>>[]>`
  — `storage.get()` the object, gunzip through `node:zlib` re-exported in `import.ts`, split NDJSON,
  verify sha-256 against `entry.checksum` and length against `entry.rowCount`, and throw
  `ConflictError("cold", "checksum")` otherwise. `21.1` later adds its paged, user-filtered `list()`
  to the same port; two features adding a method each is what puts the port in `port/`.
  Whole-object, at the ~8 MB tenant-month bound `21.1` states, with the same 50 MB streaming escape
  hatch. `InMemoryColdArchiveReader` in `composition/src/fake/`, fed by the fake storage gateway.
  **Tripwire:** `test-container.spec.ts` moves to twenty-seven — this port arrives before `21.1`
  would have added it. `ActivitySubject.of` is lifted to `application/src/primitive/activity-subject.ts`
  and `PgActivityReplayReader` calls it. **Docs:** new `packages/infrastructure/docs/reference/cold-restore.md`
  (registered), `activity-archive.md` gains "reading it back", `ports.md`.

- [ ] `19.18` **Restore a month, on `17.4`'s rule** — `17.4` restores into a **scratch table, never
  the live parent**, because a re-attached month leaves the retention job arguing with itself. This
  action keeps that rule and adds the one case where attaching is right: the month is inside the
  table's hot window. `restore-partition.use-case.ts` (`platform.retention.manage`; input
  `{ tableName, period, organizationId? }`; validates matching `partition_archive` rows exist,
  records `platform.restore.requested` (rebased per decision D38), enqueues `cold-restore` with the
  dedupe `jobId`). `MaintenanceConsumer.restore()`: `17.4`'s `restore()` per object into the scratch
  table, `cold.partition.restored` per object; then, **only if** the period is at or after the
  cutoff `prune()` would compute from the table's hot months, `maintenance.attachMonthlyPartition(table,
  period, scratch)` — one `alter table … attach partition … for values from … to …`, a new method on
  the existing port, mirrored in `RecordingMaintenanceGateway` — and the month is live again. Outside
  the window the scratch table stays as evidence: nothing sweeps it, on purpose; the next restore of
  the same month replaces it, and the screen says "raise hot months to *N* first to bring it live".
  `outbox_event` restored rows carry `published_at`, so `drain` never re-publishes them, and the item
  says so. Restore panel on `/platform/retention`: table, month, optional tenant → button → `Callout`
  with the job id and which of the two outcomes applies. **Docs:** `cold-restore.md`, `cold-storage.md`
  (`17.4`'s section gains the attach case), `consumers.md`, `schedules.md`, `ports.md`.

- [ ] `19.19` **Per-tenant retention override** — the scaling plan's decision D29 makes a tenant's
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
  `19.15`'s preview takes an optional `organizationId`. Edited from the tenant row on the shard map
  (`25.4`) and a tenant panel on `/platform/retention`. Decision 19. **Docs:** `platform.md`,
  `cold-storage.md`, `docs/setup/13` §13.3.

- [ ] `19.20` **Delete a tenant** — the first tenant deletion in the repository, which is the
  trigger `17.6` was written without. `delete-organization.use-case.ts` under a new
  `platform.tenant.manage` key (registered in `18.2`; the seed grants it to `platform_admin`):
  refuses the platform organization itself; archives every tenant-month first (the `17.5` path
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
  (decision D38). Cold objects stay thirty days: the `retention` job's sweep deletes
  `partition_archive` rows and objects whose organization no longer exists and whose `archived_at`
  is older than that, `cold.objects.swept` with `reason: "tenant_deleted"`. Procedure
  `tenants.delete`, a confirmation that requires typing the slug, on the shard map's tenant row.
  Decision 20. **Docs:** `platform.md`, `cold-storage.md` (`17.6`'s section gains its trigger),
  `sharding.md`.

- [ ] `19.21` **Export a tenant** — the design was sold partly on "hand a customer every byte they
  own", and nothing built it. `export-organization.use-case.ts` (`platform.tenant.manage`; records
  `tenant.export_requested`; enqueues `tenant-export` on `MAINTENANCE` with the dedupe `jobId`).
  `MaintenanceConsumer.export()`: for each of the seven tenant-owned tables, stream that tenant's
  rows through the archive gateway's existing per-tenant NDJSON writer (`17.3`'s `rows()` and
  `putStream`), live rather than detached, into one object per table under
  `export/<organization_id>/<yyyy-mm-dd>/<table>.ndjson.gz`; plus the tenant's catalog rows —
  memberships, roles, role grants, invitations, API keys with their hashes redacted — as an eighth
  object; plus a manifest with row counts and checksums. `cold.tenant.exported` (`info`,
  `{ organizationId, objects, rows, bytes }`). The screen offers a presigned download per object,
  the first caller of `presignDownload`. Objects under `export/` expire by a lifecycle rule after
  seven days, the one prefix rule the app adds beside `cold/` (`19.5`). Added 2026-09-17.
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
twenty-seven (`19.5` and `19.17`).

---

---

## Phase 20 — Projection policy: which actions reach ClickHouse, and for how long each

**Depends on:** Phase 19's Exit.

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
actions (decision D35). The `retention` job applies it exactly as Phase 19 does. `AnalyticsConsumer`
reads the exclusion list once per run and passes it to all three queries.

- [ ] `20.1` **The action catalog** — `contracts/src/catalog/<slice>.actions.ts` for `rbac`, `member`,
  `apikey`, `ai`, `platform` (the fourteen existing literals plus `platform.policy.changed`), each
  `{ label }` for the screen, merged into `ACTIVITY_ACTIONS` in `catalog/index.ts`;
  `registry/activity-actions.ts` with `ActivityAction`, `ActivityActions.isKnown`, `.all()`.
  `ActivityLogger.record(actor, action: ActivityAction, payload)` — the compile error at every call
  site is the migration. `set-member-active.use-case.ts:45` emits two actions from one site and
  both are entries. `docs/ai/skills/add-slice.md` step 7 gains "declare the action". **Docs:**
  `docs/opinions/vocabulary.md` (activity names are now a catalog, like domain events, and the two
  are still different vocabularies), `packages/contracts/docs/index.md`.

- [ ] `20.2` **Schema, port, adapter** — `projection_policy` in `platform.schema.ts`, `TENANT_EXEMPT`
  line with the comment (the projection is cross-tenant by construction),
  `projection-policy.repository.ts` (`all()`, `save(row)`), `pg-projection-policy.repository.ts`.
  **Docs:** `docs/setup/13` §13.3, `docs/setup/26` §9.

- [ ] `20.3` **Three queries, one list** — `ActivityReplayReader.since(checkpoint, limit, excluding)`
  and `dailyCounts(from, to, excluding)`; `AnalyticsProjector.dailyCounts(from, to, excluding)`.
  `AnalyticsConsumer.project()` and `reconcile()` read `projectionPolicies.all()` once and pass the
  excluded actions to every call. Integration spec: exclude one action, insert rows of two actions,
  project, reconcile — zero drift, and the excluded action's rows are absent from ClickHouse.
  **Docs:** `clickhouse.md` reconciliation section, `consumers.md`.

- [ ] `20.4` **Per-action TTL composition** — `RetentionRules.clickhouseTtlFor(defaultMonths, perAction)`
  produces `toDateTime(occurred_at) + INTERVAL a MONTH DELETE WHERE action = 'x', …, toDateTime(occurred_at) + INTERVAL d MONTH DELETE WHERE action NOT IN ('x', …)`;
  unit spec pins the expression for zero, one and three per-action rows, and a case proving that
  without the `NOT IN` a longer per-action TTL is deleted by the default clause (run against the
  live container under `pnpm smoke`, because only ClickHouse can prove it). `retention()` normalises
  whitespace and quoting before comparing. **Docs:** `clickhouse.md`.

- [ ] `20.5` **Use-cases, contract, router, container** — `list-projection-policies` (`platform.analytics.read`;
  every catalog action joined to its row or the default) and `update-projection-policy`
  (`platform.analytics.manage`; `action` validated by `ActivityActions.isKnown`; write + audit in the
  transaction; `applyRetention` after it). `projection.list` / `projection.update` procedures, the
  permission entries, the router, `container.platform` grows two. **Docs:** `platform.md`.

- [ ] `20.6` **The screen** — `projection-policy.form.tsx`: one row per action, grouped by the
  action's slice, a projected toggle and a months field; a `Callout tone="danger"` when a toggle goes
  off: rows already in ClickHouse stay, new rows stop, and after the Postgres retention window the
  gap cannot be replayed except from cold storage. Route `platform/analytics.tsx`, copy in both
  locales. **Docs:** `packages/feature/docs/index.md`.

- [ ] `20.7` **Docs** — `clickhouse.md` §"What is not wired" rewritten: the policy is wired, the
  read driver still is not; `docs/opinions/data-and-scale.md` "On ClickHouse specifically" gains one
  sentence on the policy rows; `21.6` marked moved here.

- [ ] `20.8` **`platform_policy` and the switch** — `platform.schema.ts`: `platform_policy (id smallint
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
  (`20.10`). Decision 12: a pause, not a power switch. **Docs:** `platform.md`, `clickhouse.md`,
  `docs/setup/13` §13.3, `docs/setup/26` §9.

- [ ] `20.9` **The consumer honours it** — `AnalyticsConsumer.project()` and `reconcile()` read
  `platformPolicy.get()` first and return when off: no batches, no lag computation, no drift
  comparison, and no log line — 288 lines a day is noise, and the status page shows the state. The
  `retention` job's `applyRetention` still runs when off: the connection exists, and a TTL edit is
  not a projection. Resume needs nothing, because the checkpoint is read from ClickHouse.
  Integration spec: off → insert rows → run → ClickHouse unchanged and no `lagged` line; on → run →
  the rows land. **Docs:** `consumers.md`.

- [ ] `20.10` **Re-project from cold storage** — `reproject-partition.use-case.ts`
  (`platform.analytics.manage`; input `{ period, organizationId? }`, `activity_log` only; refuses
  when not configured; records `platform.reproject.requested`; enqueues `cold-reproject` on
  `MAINTENANCE` with `jobId: "cold-reproject:activity_log:<period>:<org|all>"`, so a double click is
  one job). `AnalyticsConsumer.reproject()` — it owns the projector: for each `partition_archive`
  row for that period (and tenant, if given): `coldArchive.read(entry)` (`17.4`'s reader) → map to
  `ActivityRecord` with `ActivitySubject.of` → drop excluded actions (`20.3`'s list) →
  `projector.project` in batches of 5,000 → stamp `projected_at` →
  `cold.partition.reprojected { period, organizationId, rows }`. Idempotent through
  `ReplacingMergeTree`. Screen: a **Gaps** panel on `/platform/analytics` listing periods with any
  `projected_at is null` row (the partial index from `17.2`), tenant counts, and a re-project
  button per period; the reason on the `analytics.projection.gap` line is not stored, so the panel
  shows only that a gap exists. **Docs:** `cold-restore.md`, `clickhouse.md`, `consumers.md`.

- [ ] `20.11` **Reconcile covers the cold window** — `reconcile()` also compares, for each archived
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

---

## Phase 21 — Archived data, where the person it belongs to can read it

**Goal.** A user who asks for their old notifications gets them, straight out of S3, with the same
tenancy rules the live inbox has and no restore to wait for.

**Independent of Phases 22 and 24.** It needs Phase 17 and nothing else, so it can be built the day
cold storage lands. It is listed last because it is a feature rather than scaling plumbing, not
because it comes last.

**Design in one paragraph.** The whole read side of `StorageGateway` — `get`, `delete`, `exists`,
`presignDownload` — is already written, already faked, and **called by nothing**; the only caller
of the gateway at all is the archive, and it only ever writes. So this phase adds no storage port
method: `17.2`'s per-tenant objects are small enough to `get()` whole (roughly 8 MB gzipped for a
four-thousand-user organization-month), and a streaming read is the escape hatch if one ever
exceeds ~50 MB, not day-one work. Every other hop copies `notification.list` exactly — contract,
procedure, permission key, use-case, three-line router, `infiniteQueryOptions`, list component.

- [ ] `21.1` **`ColdArchiveReader`** — port in `application/src/port/`, `S3ColdArchiveReader` in
  `infrastructure/src/s3/`. `list(organizationId, userId, table, period, cursor, limit)`: look up
  the object key in `partition_archive`, `storage.get()`, gunzip, parse NDJSON, filter to the user,
  page. The cursor is a **line ordinal within a named object**, not a `(timestamp, id)` keyset —
  `KeysetCursor` does not describe this and gets a sibling rather than a widening that makes both
  harder to read. A missing `partition_archive` row is an empty page, never an error: a month with
  no rows for this tenant was never written.
  **Note the layering:** the port may name no framework (§1), so the signature speaks
  `AsyncIterable<Uint8Array>` and plain types the way `putStream` already does.
  **Depends on:** `17.2`. **Docs:** `packages/application/docs/reference/ports.md`.
  Cost named up front (2026-09-14): every page turn reads and gunzips the whole tenant-month
  object to serve one user's slice, because the cursor is an ordinal inside it. **Reopen when**
  p95 on the archived view passes 500 ms — then `notifications`, the one archived table with a
  `user_id`, gets a per-user object layout under the same `cold/` prefix and this becomes a small
  read. That is a different escape hatch from the streaming one above.

- [ ] `21.2` **Contract, procedure, permission** — `notification.archived` returning the existing
  `Keyset.page(NotificationContract.entity)`, so the client renders it with the component it
  already has. New permission key `notification.archive.read` in
  `packages/permissions/src/catalog/notification.permissions.ts`, and the matching
  `PROCEDURE_PERMISSIONS` entry in `packages/contracts/src/catalog/notification.permissions.ts`.
  **Forgetting the second is a hard 403 rather than an open door** — `principalMiddleware` denies
  any procedure with no mapping — which is the fail-closed behaviour to rely on, not to route
  around. A second procedure, `notification.archivedMonths`, lists the months that actually exist
  from `partition_archive`, so the UI offers real months instead of a date picker that mostly
  returns nothing.

- [ ] `21.3` **The use-case** — `ListArchivedNotificationsUseCase.execute(actor, input)`:
  `authorizer.assert(actor, "notification.archive.read")`, then the tenant **and the user** off
  `actor`, never off `input`. `ListNotificationsUseCase` already carries the rule in a comment —
  "there is no 'list someone else's': the permission grants you *your* notifications, and a userId
  input would be the hole" — and an archive read is exactly where that hole would be easiest to
  open, because the object on disk holds the whole tenant.

- [ ] `21.4` **Router, route, UI** — a three-line handler beside the others; an "Older than a year"
  view on the existing notifications page, gated with `RouteGuard.requirePermission` the way
  `settings/roles.tsx` is. Query keys join `QueryKeys.notification`.

- [ ] `21.5` **Docs** — the notification reference gains the archived read;
  `apps/web/docs/reference/enforcement-surfaces.md` gains nothing new (this is an ordinary
  procedure), which is itself worth one sentence — the surface count does not grow.

- [-] `21.6` **The platform tier and the retention dashboard** `dropped: 2026-09-14` — decision D23 — reopened the same day as Phase 18.

**Exit.** A seeded user with a month in cold storage opens the archived view and reads their own
rows; a user in another organization reading the same month gets nothing, proven by a spec rather
than by the absence of a bug report; `notification.archived` with the permission revoked is a 403;
a month that was never archived is an empty page.

---

---

## Phase 22 — Virtual sharding: the seam, verified on one node

**Goal.** Every routed query is placed by a key the strategy derives, resolved through a directory
to one physical `Database`; the catalog and
the routed transactions are distinct and a repository that crosses them throws on one node; the
migrator, the seed, the health probe and every cross-tenant worker path loop the physical shards;
and a second physical shard is one compose profile and two env lines away — with the proof of
that split filed, not claimed.

**Design in one paragraph.** `ShardingStrategy.keyOf(principal)` runs once per request in a
`shardMiddleware` after `principalMiddleware`, and once per job in the worker's consumers, and
puts the `ShardKey` in `ShardScope` (an `AsyncLocalStorage<ShardKey>` beside `TransactionScope`).
`DatabaseCluster` holds one `Database` per physical shard from `DATABASE_SHARD_<n>_*` and answers
`catalog()`, `forKey(key)` (via `ShardResolver`, which reads the node from `shard_assignments` on
the catalog through a `CacheStore` read-through with a 300 s TTL and an explicit `invalidate(key)`),
and `each()`. `TransactionScope` stores `{ client, placement }`; `BaseRepository` declares its
placement and `this.db` resolves to the open transaction when placements agree, the right pool
when no transaction is open, and an `InternalError` when they disagree. Two `PgUnitOfWork`
instances — catalog and routed — are bound per slice in `Container`. `PgOrganizationFounder`
writes the `shard_assignments` row inside the catalog transaction that creates the organization;
a backfill migration writes one per existing organization, naming node 0. The shipped strategy
lives in `packages/composition/src/shard/`, which is the fork's swap point; no placement policy
ships until the split (decision D12, revised 2026-09-16). Verification is on one Postgres: the whole
suite through the cluster, the tripwire spec, and the scope unit specs; the two-node rehearsal spec
is written, gated on `DATABASE_SHARD_1_URL`, and expected to fail on the catalog foreign keys until
`24.1`.

#### Primitives and ports (`application`)

- [ ] `22.1` **Primitives** — `packages/application/src/primitive/shard.ts`: `ShardKey` (branded
  string, `ShardKey.of(raw)` rejects empty), `Placement` (`"catalog" | "local" | "routed"`), and
  `CatalogTable` — a frozen closed list of the catalog table names decision D14 lists (a list, not a
  number: it is sixteen while `activity_archive` exists and fifteen after its drop) plus
  `LOCAL` for the two local ones; `placementOf(table)` derives the third case.
  `revised: 2026-09-16` — no `VirtualShard`: the shard is the organization (decision D28).
  **Docs:** `packages/application/docs/index.md` tree,
  `docs/opinions/vocabulary.md` (a "Shard vocabulary" row set).

- [ ] `22.2` **Ports** — `packages/application/src/port/sharding.strategy.ts`
  (`keyOf(principal: Principal): ShardKey`), `shard.resolver.ts`
  (`resolve(key): Promise<number>` — the physical node — and `invalidate(key)`),
  `shard-assignment.repository.ts` (`findByKey`, `save({ key, node })`, `all(page)` for the move
  job). No principal on the last two: they are platform seams, like `MaintenanceGateway`.
  `revised: 2026-09-16` — three ports, not four: `shard-placement.policy.ts` is gone with the hash
  (decision D12, revised); a policy earns its place at the split. **Tripwire:**
  `test-container.spec.ts` pins the sorted port list and counts `src/port/*.ts`, so this commit
  also updates `TestContainer` (`22.13`). **Docs:** `packages/application/docs/reference/ports.md`
  gains "The three shard ports".
  `verified: 2026-09-13, second pass` — the tripwire is real: `test-container.spec.ts:30-37`
  reads `application/src/port/` with `readdirSync`, asserts the harness has exactly that many
  keys plus the four `NOT_PORTS`, and pins the sorted list. Four new port files break both in one
  commit, as the item says.

#### Schema (`infrastructure`)

- [ ] `22.3` **`shard_assignments`** — `packages/infrastructure/src/pg/schema/shard.schema.ts`:
  `shard_key text primary key`, `node smallint not null default 0`, `assigned_at`,
  `moved_at` nullable; `shard_assignments_node_idx (node)` for the move job and the shard map. A
  catalog table, so no `organization_id` — §9's exemption set becomes derived from
  `CatalogTable` (`22.18`), and this is the first table to rely on it. Migration
  `0024_*.sql` (`0023` went to `messages`, `16.2`, 2026-09-15), generated, then hand-appended with the backfill:
  `insert into shard_assignments (shard_key, node) select id::text, 0 from organizations on conflict do nothing`.
  **Docs:** `docs/setup/13` §13.3 modelling notes, `docs/opinions/vocabulary.md` table list.
  `superseded: 2026-09-16` — the FNV-1a verification this item carried (SQL and TypeScript agreeing
  on ten pinned vectors, the recursive CTE, the mask after every multiply) is gone with the hash:
  there is nothing to verify, the backfill is a constant (decision D28).

#### Routing (`infrastructure`)

- [ ] `22.4` **`DatabaseCluster`** — `pg/primitive/database-cluster.ts`: one `Database` (and one
  direct `Database`, `14.11`) per physical index; `catalog()`, `forKey(key)` (awaits
  `ShardResolver.resolve`, which is the node), `each()`, `isHealthy()` per shard
  as `Record<index, boolean>`, `close()`. It is the only file in `src/` that writes
  `new Database(` (`22.18` §23). **Docs:** `sharding.md`.

- [ ] `22.5` **`ShardScope` and placement in `TransactionScope`** — `pg/transaction/shard-scope.ts`
  (`current(): ShardKey | undefined`, `within(key, work)`); `transaction-scope.ts` stores
  `{ client, placement, key? }` and exposes `current()`, `placement()`. **Docs:**
  `packages/infrastructure/docs/reference/unit-of-work.md` (the "which pool" paragraph).

- [ ] `22.6` **`BaseRepository` places itself and trips** — constructor takes
  `(cluster, transactions, shards, placement: Placement)`; `this.db` becomes an `async` accessor
  `this.handle()`: open transaction with the same placement → it; open transaction with a
  different placement → `InternalError("<table placement> inside a <tx placement> transaction")`;
  no transaction → `cluster.catalog().client` for `catalog`, `cluster.forKey(ShardScope.current()
  ?? throw)` for `routed`, and for `local` the catalog pool with a comment saying a local write
  outside any transaction is already against the outbox rules. Every `pg-*.ts` in
  `pg/repository/` declares its placement in `super(...)`; the twenty-plus call sites of
  `this.db` become `await this.handle()`. Mechanical, one commit, and the reason `22.18`'s §22
  exists is that nothing else stops a routed table from being read through a catalog repository.
  **Docs:** `docs/setup/13` §13.7, `docs/ai/skills/add-slice.md` step 6 ("declare the
  placement; a slice is `routed` unless decision D14 lists it").
  `corrected: 2026-09-14` — three counts. `BaseRepository` is at `pg/primitive/base.repository.ts`,
  not in `repository/`. Twenty-three classes extend it, not twenty-two: `SystemRoleSeed`
  (`pg/seed/system-role.seed.ts:72`) is the twenty-third, built as a field initialiser inside
  `PgOrganizationFounder` (`pg-organization.founder.ts:30`) off the founder's own handle, so it is
  `catalog` and must say so rather than inherit it. And `this.db` is read 127 times across `pg/`
  (123 in `repository/`, 4 in the seed), not "twenty-plus". §22 (`22.18`) globs every file under
  `pg/` that extends `BaseRepository`, not `pg/repository/pg-*.ts`.

- [ ] `22.7` **Two `PgUnitOfWork`s** — `pg-unit-of-work.ts` takes `(cluster, transactions, shards,
  placement)`; `run(work)` opens on `catalog()` or on `forKey(ShardScope.current())`, throwing
  `InternalError` when `routed` and no key is in scope, and passes `placement` into
  `TransactionScope.within`. Nested `run` on the same placement is the savepoint it is today;
  nested on a different placement throws — a catalog use-case calling a routed one inside its
  transaction is precisely the coupling a split cannot honour. `14.8`'s `SET LOCAL` survives.
  Spec: the tripwire in both directions, the savepoint path, the missing-key path. **Docs:**
  `unit-of-work.md`.
  `corrected: 2026-09-13, second pass` — **four transactions in `src/` never pass through
  `PgUnitOfWork`, so the tripwire as designed never sees them.** `pg-organization.founder.ts:43`
  (`this.db.transaction`), `pg-personal-organization.enroller.ts:33`,
  `pg-invitation.claimer.ts:79` and `pg-bootstrap-membership.enroller.ts:53`
  (`this.database.client.transaction`) each open a drizzle transaction directly and call
  `this.scope.within(tx, …)` themselves — with no placement, because `within` has none yet. All
  four are catalog work, so the fix is mechanical and this item owns it: they take the catalog
  `PgUnitOfWork` and call `run`, which keeps the founder's "savepoint inside the enroller's
  transaction" behaviour because `run` already nests. `22.12`'s sentence "passes the catalog unit
  of work to the enrollers, claimer and founder" describes constructor arguments those classes
  do not have today; after this correction they do.

- [ ] `22.8` **`PgShardResolver`** — `pg/repository/pg-shard.resolver.ts`, `CapabilityCache`'s
  shape: `CacheStore` read-through on `shard:key:<key>` with a 300 s TTL (a placement changes
  once a year, not once a minute; the move job invalidates explicitly), catalog pool underneath,
  `shard.resolution.failed` (`error`, `{ key }`) then `InternalError` on a missing row. It is
  built on `cluster.catalog()` directly, not on `BaseRepository`: it is what `forKey` calls, and
  a resolver that routed would recurse. **Docs:** `sharding.md`.
  `verified: 2026-09-13, second pass` — `CapabilityCache` exists where the plan says
  (`packages/auth/src/principal/capability.cache.ts`), prefix `capability:user:`, TTL **60 s**
  (`:17`). The item copies "the shape, TTL and prefix included" and then says 300 s; the
  divergence is deliberate (a placement changes once a year) and the item should say so rather
  than let a reader think one of the two numbers is a typo.

- [ ] `22.9` **`PgShardAssignmentRepository`** — `pg/repository/pg-shard-assignment.repository.ts`,
  `catalog` placement: `findByKey`, `save` (upsert, `moved_at` set when `node` changes,
  then `resolver.invalidate(key)`), `all(page)` keyset over `shard_key`. Emits nothing; the
  founder emits `shard.assignment.created` (`info`, `{ key, node }`). **Docs:** `sharding.md`.

- [ ] `22.10` **`PgNotificationRecipientReader.conversationMembers` is split** — filed by the
  audit at `22.18`, and it is the only cross-placement query in the repository. The method joins
  `conversation_members` (routed) to `users` and `memberships` (both catalog) in one statement, so
  it has no plan at all once the two sit on different physical databases — unlike everything else
  in `CROSS_PLACEMENT_KNOWN`, which is empty apart from it.
  Split it the way decision D15 already prescribes for a crossing read: page the conversation's
  member ids off the routed shard first, then resolve those ids through the existing
  `users(organizationId, userIds)` on the catalog, which is already written, already one
  statement per page, and already applies the `deactivatedAt` filter this method needs. Two
  queries per page instead of one, both tenant-scoped, and the query count stays bounded by the
  page rather than the recipient list.
  Landing this empties `CROSS_PLACEMENT_KNOWN` before Phase 22 ends rather than at `24.1`, which
  is the difference between §22 guarding a rule and §22 recording an exception.
  **Docs:** a new `packages/infrastructure/docs/reference/notification-recipients.md` — the
  reader's own comment already says "See docs/reference/notification-recipients.md" and that page
  has never existed, so the `EXISTS` claim it defers to is written down nowhere; registered in
  `reference/meta.json` and named from `packages/infrastructure/docs/index.md`. Also
  `packages/application/docs/reference/notification-policy.md`, `sharding.md`.
  **Depends on:** `22.6`.

#### The strategy and the policy the kit ships (`composition`)

- [ ] `22.11` **`packages/composition/src/shard/`** — new folder, one row in
  `docs/opinions/folders.md` ("the routing policy the DI root binds; a fork replaces this folder")
  and `docs/ai/rules/folders.md`. `organization-sharding.strategy.ts` →
  `OrganizationShardingStrategy.keyOf(principal) = ShardKey.of(principal.organizationId)`, with
  the `NIL` organization of `SystemPrincipal.platform()` rejected (platform work uses `each()`,
  never a key). `revised: 2026-09-16` — no placement policy ships: the founder writes node 0
  (decision D12, revised), and the hash policy this item described is gone with the 256 layer
  (decision D28). **Docs:** `packages/composition/docs/index.md` tree, `sharding.md` ("how a fork shards
  by something else": one strategy class, one key column on its tables, nothing else).
  `corrected: 2026-09-13, second pass` — "the `NIL` organization of `SystemPrincipal.platform()`
  rejected (platform work uses `each()`, never a key)" assumes platform work never touches a
  routed table. It does, constantly: `NotificationConsumer.digest` and `fanOut`
  (`notification.consumer.ts:70,94`) and `MailConsumer` (`mail.consumer.ts:80`) run under
  `platform()` — the NIL uuid, `system-principal.ts:34` — and the digest reads
  `notification_preferences` and writes `notifications`, both routed, with the tenant arriving in
  the **job data** (`data.organizationId`), not on the principal. Likewise
  `NotificationSubscriber` builds `Principal.system(event.organizationId, …)` for `deliver`, so
  there the tenant is on the principal but arrives from the event. Only
  `embedding.consumer.ts:66` builds `forOrganization`. `keyOf(principal)` therefore routes one
  worker path out of four, and rejecting NIL throws on the other three. The strategy stays
  principal-based for the web edge; `22.15` derives the worker's key from the payload.

- [ ] `22.12` **`Container`** — `container.config.ts` `database` becomes
  `{ url, directUrl, poolMax…, shards: readonly { index, url, directUrl }[] }`; both
  `env.ts` collect `DATABASE_SHARD_<n>_*` with a `z.preprocess` over `process.env` keys (still
  the one reader). `Container` builds `DatabaseCluster`, `ShardScope`,
  `PgShardResolver`, `PgShardAssignmentRepository`, both `PgUnitOfWork`s, binds
  `OrganizationShardingStrategy`, passes the catalog unit of work
  to `container.rbac`, `container.member`, `container.apiKey`, the enrollers, claimer and founder,
  and the routed one to `container.notification`, `container.messaging`, `container.ai`;
  `PgOrganizationFounder.found` writes the assignment `{ key, node: 0 }` inside its transaction
  (`revised: 2026-09-16` — no policy, no `ShardMap`, no `virtual` in the config; decision D28);
  `health()` reports `database: Record<index, boolean>` and `dispose()` closes the cluster last.
  `Container` exposes `shards: ShardScope`, `sharding: ShardingStrategy` and `cluster` for the
  edges (`22.14`, `22.15`). **Docs:** `docs/setup/17`, `packages/composition/docs/reference/container.md`.
  `corrected: 2026-09-13` — **four of the six names this item binds do not exist.** `container.ts`
  has `ApiKeyUseCases` and `MemberUseCases` as interfaces and nothing called `RoleUseCases`,
  `NotificationUseCases`, `MessagingUseCases` or `DocumentUseCases`; the rest are anonymous
  object literals on `public readonly` fields. The real surface, and the placement each takes:

  | Container member | Placement |
  |---|---|
  | `rbac`, `member`, `apiKey` (`private apiKeyUseCases`) | catalog |
  | `organizationFounder`, `invitationClaimer`, the enrollers | catalog |
  | `notification`, `messaging`, `ai` | routed |
  | `mail` | neither — `SendMailUseCase` opens no transaction |

  The names above are corrected in place. Note what this costs the item: `rbac`, `notification`
  and `messaging` are object literals, so there is no type to bind a unit of work *to* and no
  compiler error when one is handed the wrong one — the mis-binding fails at the first spec that
  touches it, as decision D16 says, and not one line earlier.
  `verified: 2026-09-13` — decision D16's harder half holds, and it was the one worth checking.
  Of the fifteen `unitOfWork.run` call sites, fourteen are use-cases and every one of them
  injects repositories of a single placement — seven catalog (`rbac` ×5, `apikey` ×2), four
  catalog via `member`, two routed (`messaging`), one routed (`ai`, `VectorStore`). None writes a
  catalog table and a routed table in the same transaction, so decision D15's tripwire has no
  existing violation to forgive. The fifteenth is `PgOutboxGateway.drain` (local). (The first
  pass counted sixteen and named "the founder's own catalog transaction" as one; the sixteenth
  hit was a comment in `domain-event.publisher.ts:8`, and the founder does not use the unit of
  work at all — see `22.7`.) Read in the second pass, the three routed bodies (`send-message`'s
  `write`, `create-conversation`'s `insert`, `index-document`) touch routed and local tables
  only; `ConversationAccess` reads `ConversationRepository` alone. Decision 6 has nothing to
  forgive in the use-cases.

- [ ] `22.13` **`TestContainer` and fakes** — `packages/composition/src/fake/`: `FakeShardResolver`
  (a `Map`), `FakeShardAssignmentRepository`, `FixedShardingStrategy`;
  `TestPorts` gains the three (`revised: 2026-09-16` — no placement policy); `test-container.spec.ts`
  pinned list updated. **Docs:**
  `packages/composition/docs/index.md`.
  `corrected: 2026-09-14` — `22.22` says "every Postgres suite now runs through `DatabaseCluster`
  with one shard" and no item builds that. `tests/support/database.ts:11` returns a bare
  `Database` off a literal `localhost:5432`, and 26 spec files call `openDatabase()`. This item adds
  `openCluster()` beside it — a single-shard `DatabaseCluster` over the same literal —
  `openDatabase()` stays for specs that need only a client, and every `BaseRepository` spec
  constructs its subject with a placement. `seed.ts:33`, `pg-maintenance.gateway.spec.ts:104` and
  `pg-organization.founder.spec.ts:139` call `database.client.transaction` and go on §23's
  allowlist or onto the catalog unit of work.

#### The key enters scope at the edges (`web`, `worker`)

- [ ] `22.14` **Web** — `apps/web/src/server/orpc/base.ts`: `shardMiddleware` after
  `principalMiddleware`, `container.shards.within(container.sharding.keyOf(principal), next)`;
  `authed` chains it. The three `server/*.fn.ts` and the realtime/message async-generator routers
  (which outlive `next()` — the scope must wrap the generator's iteration, not its creation) get
  the same wrap through one `withShard(container, principal, fn)` in `apps/web/src/server/`.
  Better Auth's own handlers are catalog-only and need no key; the sign-in hook's
  `activeOrganizationFor` is a catalog read. **Docs:** `apps/web/docs/reference/enforcement-surfaces.md`
  (a fourth surface: the shard scope), `docs/setup/24`.
  `verified: 2026-09-13` — the parenthesis is right and it understates the failure. Built against
  this repository's own `@orpc/server`, a middleware shaped exactly like `shardMiddleware`
  (`als.run("KEY", () => next())`) over a unary handler reads `KEY`; over an **async-generator**
  handler it reads `UNDEFINED` on every frame. Not a leak on reconnect, not a race — no key at
  all, always, on `realtime.stream` and `message.stream`. Plain Node says why: `next()` resolves
  once the generator is *created*, and every `.next()` after that runs in the caller's context.
  So the fix cannot be "wrap the generator", because the wrap has to survive a `run()` that has
  already returned. Two shapes work, both measured:
  **(a)** `AsyncLocalStorage.snapshot()` taken inside the middleware's `run()`, and the returned
  async iterator replaced with one whose `next`/`return`/`throw` each call through it. No handler
  changes, and it fixes every streaming procedure at once — take this one.
  **(b)** `ShardScope.enterWith(key)` as the first statement of each generator body, which also
  holds across yields but puts the key back in the handlers and is one forgotten line from a
  silent cross-shard read.
  Whichever lands, the spec belongs beside the middleware and must iterate at least twice: a
  single-frame test passes under the broken shape often enough to be worthless.
  `verified: 2026-09-13, second pass` — re-proved over the production path rather than `call()`:
  a real `RPCHandler` handling a `Request`, SSE body read back. Broken shape: `UNDEFINED` on
  frame 0 and every frame after; snapshot wrapper (a): `KEY` on all three; unary: `KEY`. Frame 0
  matters because `message.stream` does its one routed read (`getConversation`) before its first
  `yield`.
  `corrected: 2026-09-13, second pass` — "the three `server/*.fn.ts` … get the same wrap" is
  wrong on all three: `session.fn.ts` is catalog-only (capabilities, memberships),
  `invitation.fn.ts` has no principal by design and reads catalog `invitations` and
  `organizations`, `appearance.fn.ts` touches no database. `withShard` is unnecessary for all
  three and impossible for two. Drop the clause; the two generator routers are the whole of it.

- [ ] `22.15` **Worker** — every consumer that builds `SystemPrincipal.forOrganization(orgId)`
  wraps its use-case call in `container.shards.within(container.sharding.keyOf(principal), …)`;
  a `withShard` in `apps/worker/src/bootstrap/` mirrors the web one. Platform consumers
  (`MaintenanceConsumer`, `OutboxConsumer`, `AnalyticsConsumer`'s replay, the archive) never set
  a key. **Docs:** `apps/worker/docs/reference/consumers.md`.
  `corrected: 2026-09-13, second pass` — "every consumer that builds
  `SystemPrincipal.forOrganization(orgId)`" is one consumer (`embedding`). The worker's two
  highest-volume routed paths run under `platform()` or a subscriber-built principal with the
  tenant in the event or job data (`22.11`). The rule becomes: **every consumer whose job carries
  an `organizationId` enters `ShardScope` with `ShardKey.of(data.organizationId)` before calling
  the use-case**, and `OutboxConsumer.deliver` does the same per event with
  `event.organizationId` before dispatching to subscribers. `withShard(container, key, fn)` takes
  a key, not a principal. Platform consumers stay as written.

- [ ] `22.16` **The five cross-tenant paths loop the cluster** — `OutboxConsumer.drain` runs
  `container.outbox.drain` once per physical shard (`PgOutboxGateway` takes the `Database` it
  drains; `SKIP LOCKED` is per shard and two replicas still share each); `MaintenanceConsumer`
  ensures and prunes partitions on every shard (`PgMaintenanceGateway` likewise);
  `PgPartitionArchiveGateway` (`17.1`) archives per shard and the key does **not** change: a
  tenant lives on one shard, so `cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz` is already
  unique, and `partition_archive` grows no shard column (`corrected: 2026-09-14` — the first text
  put the shard index in both, and `24.2` or `24.8` would then leave every key and row naming the
  shard the tenant had left; the partition is per shard, the object is per tenant, only the loop
  is per shard);
  the projection loops tenants (`16.6`), resolving each tenant's node through the resolver, and
  needs no per-shard checkpoint and no `shard` column in ClickHouse (`revised: 2026-09-16` — the
  first text keyed the checkpoint per physical shard);
  `PgNotificationPreferenceRepository.organizationsWithDigest` runs per shard and the digest
  fan-out sets the key per organization. Each keeps its query count; the loop is over shards, not
  tenants. **Docs:** `apps/worker/docs/reference/schedules.md`, `consumers.md`,
  `packages/infrastructure/docs/reference/clickhouse.md`, `activity-archive.md`.

#### Migrations, seed, scripts (`infrastructure`)

- [ ] `22.17` **Every script loops the physical shards** — `migrate.ts` migrates each
  `directUrl` in index order (catalog first, so a backfill that reads it runs against a migrated
  catalog); `seed.ts` seeds the bootstrap organization on the catalog and its assignment;
  `partitions.ts` (`16.9`) loops; `drizzle.config.ts` and `db:studio` stay on the catalog with the
  comment. The env parsing they share moves into one `packages/infrastructure/shard-env.ts` above
  `src/` (a script, not a module — the same rule that keeps `migrate.ts` there). **Docs:**
  `docs/setup/13` §13.5–13.6, `docs/ai/rules/workflow.md`.

#### Assertions (`tooling`)

- [ ] `22.18` **§22 and §23; §9 derived** — `check-architecture.mjs`: §9's `TENANT_EXEMPT` is
  parsed from `CatalogTable` in `application/src/primitive/shard.ts` (plus
  `__drizzle_migrations`), so a table cannot be catalog in one file and tenant-exempt in another.
  §22: for every `pg/repository/pg-*.ts`, the tables it imports from **any** `../schema/*` path
  all share one placement (`local` mixes with either), or the file is in `CROSS_PLACEMENT_KNOWN`,
  which `24.1` empties. The audited set, at `49703c9`, is one file:

  ```js
  const CROSS_PLACEMENT_KNOWN = new Set(["pg-notification-recipient.reader.ts"]);
  ```

  §23: `new Database(` appears in `src/` only in
  `database-cluster.ts`, and `database.client` / `.client` off a `Database` only there and in the
  scripts above `src/`. `docs/setup/26` gains the three entries with the failure each prevents.
  **Docs:** `docs/setup/26`, `docs/ai/rules/workflow.md` (twenty-three), `AGENTS.md`.
  `corrected: 2026-09-13` — three findings from running the audit, and two of them change the
  assertion rather than its seed list.
  **One.** The named example is wrong: `pg-membership.reader.ts` joins `users`, `organizations`
  and `roles` to `memberships`, and all four are catalog. It does not cross. Twenty-one of the
  twenty-two repository files are cleanly single-placement.
  **Two.** The one file that does cross would have been **invisible to §22 as specified.**
  `pg-notification-recipient.reader.ts` imports from `../schema/auth.schema.js`,
  `../schema/messaging.schema.js` and `../schema/rbac.schema.js` directly, never from
  `../schema/index.js`, so a check reading the barrel import finds nothing and passes it. Scan
  every `../schema/*` specifier. That it reaches past the barrel at all is its own small
  violation of `docs/ai/rules/imports.md` rule 2, and fixing that would have closed the blind
  spot for free — which is the argument for the rule.
  **Three.** §22 cannot see a table named in raw SQL, and two files name one:
  `pg-outbox.gateway.ts` (`outbox_event`) and `pg-activity-archive.gateway.ts` (`activity_log`).
  Both are `local` and benign, and both would be invisible if they were not. State the blind spot
  in `docs/setup/26` beside the assertion, the way §17 and §18 record theirs.
  `corrected: 2026-09-13` — **§9's `TENANT_EXEMPT` must not be derived from `CatalogTable`.**
  The two sets answer different questions and only partly overlap: `TENANT_EXEMPT` is eight
  entries (`organizations`, `users`, `accounts`, `verifications`, `two_factors`, `sessions`,
  `activity_archive`, `__drizzle_migrations`) where decision D14's catalog is fifteen. Deriving one
  from the other would exempt `memberships`, `roles`, `role_permissions`, `goal_members`,
  `permission_overrides`, `invitations` and `api_keys` — seven tables that do carry
  `organization_id` and are exactly what §9 exists to police. Living on the catalog and carrying
  a tenant column are independent facts. `shard_assignments` joins `TENANT_EXEMPT` as one
  hand-written line, with a comment saying which of the two it is.
  `corrected: 2026-09-13, second pass` — §23's allowlist as stated ("only in the cluster and the
  scripts above `src/`") fails on landing. `.client` off a `Database` is read outside
  infrastructure `src/` at `packages/auth/src/factory/auth.factory.ts:55`
  (`drizzleAdapter(database.client, …)` — after `22.4` it is handed `cluster.catalog().client`),
  `packages/infrastructure/seed.ts:31`, and inside `src/` by the three enrollers'
  `this.database.client.transaction` (`22.7` removes those). `new Database(` has a fifth site the
  plan does not name, `packages/auth/tables.ts:116`, a script above `src/` in a different
  package; and there is **no** `packages/infrastructure/smoke.ts` to allowlist — the package root
  holds `drizzle.config.ts`, `migrate.ts`, `seed.ts`. Name the real set.
  `corrected: 2026-09-14` — two things decided. The session-`SET` grep `14.7` asked this item to
  consider is **not built**: `update outbox_event set published_at = …` (`pg-outbox.gateway.ts:56`)
  is the false positive, and a grep cannot tell `UPDATE … SET` from a bare `SET` without parsing
  the statement; the rule stays in `pgbouncer.md` and the pooled smoke spec is the detector. And
  `TENANT_EXEMPT` gains exactly one line from this plan, `shard_assignments` — `partition_archive`
  leads with the tenant and needs none.
  `revised: 2026-09-16` — §9 and §17 read the tenant column from one constant `TENANT_COLUMN` at
  the top of the script rather than the literal `organization_id` in two places, so a fork
  sharding by another column edits it once; its value is asserted equal to `TenantKey` on the
  allowlist, the way §9 parses that file.

#### The rehearsal kit (`infra`, `infrastructure`)

- [ ] `22.19` **Compose profile `sharded`** — `infra/docker-compose.yml`: `postgres-shard-1` (same
  image, same `init.sql`, port `${POSTGRES_SHARD_1_PORT:-5433}`, own volume) and
  `pgbouncer-shard-1` on `:6433`; root script `infra:up:sharded`; `.env.example` gains a commented
  block `DATABASE_SHARD_1_URL=postgres://…:6433/ratchet`, `DATABASE_SHARD_1_DIRECT_URL`,
  and no range line (`revised: 2026-09-16` — the directory names the node). **Docs:**
  `docs/infra/reference/compose.md`, `docs/setup/11`.

- [ ] `22.20` **The rehearsal spec** — `packages/infrastructure/tests/smoke/sharded.spec.ts`,
  `describe.skipIf(!process.env.DATABASE_SHARD_1_URL)`: migrates both shards, creates two
  organizations whose assignment rows, written by the spec, name node 0 and node 1, sends one message in
  each through `MessagingUseCases`, asserts each `messages` row exists on exactly its physical
  shard and that `shard_assignments` on the catalog has both rows. **Expected to fail on
  `notifications.user_id → users` and `… organization_id → organizations` on shard 1 until
  `24.1` decides the foreign keys** — the item is done when the spec is written and fails on
  exactly that constraint, which is the split's first real cost made visible. **Docs:**
  `sharding.md` ("rehearsing the split").
  `corrected: 2026-09-13, second pass` — two things. The spec cannot be gated on
  `process.env.DATABASE_SHARD_1_URL`: `check-architecture` §3 walks `tests/` for `process.env`,
  and the smoke config's `provide` is the only door — `Stack.database.shard1Url?`, and the file is
  `sharded.smoke.spec.ts` or the config never includes it (`14.12`). And "fails on
  `notifications.user_id → users` and `… organization_id → organizations`" names two of **nine**
  routed→catalog foreign keys, every one `ON DELETE CASCADE`: `notifications` → `organizations`,
  `users`; `notification_preferences` → `organizations`, `users`; `conversations` →
  `organizations`; `conversation_members` → `organizations`, `users`; `messages` →
  `organizations`; `document_chunks` → `organizations`. Which one the spec trips first depends on
  insert order; write the expectation as "a foreign-key violation naming a catalog table", and
  list the nine at `24.1`.

#### Docs and verify

- [ ] `22.21` **Docs** — new `packages/infrastructure/docs/reference/sharding.md` (the key, the
  directory, the three placements and the tripwire, the two unit-of-works, the edges,
  the loops, how a fork shards by something else — the four edits and nothing else: (1) `TenantKey`
  on the allowlist and the column it names on every tenant-owned table; (2) one strategy class in
  `composition/src/shard/`, `keyOf(principal)`; (3) `TENANT_COLUMN` in `check-architecture.mjs`
  (`22.18`); (4) `22.15`'s worker-side key derivation from job data; the directory's `shard_key` is
  opaque text and does not change, and the generator and the seed read the alias — rehearsing
  the split, what §4 still owes),
  registered in `reference/meta.json` and `docs/index.md`. `docs/opinions/data-and-scale.md`:
  new §4.5 "Route by key from the first line" (the seam-early argument, quoting
  `simplicity.md`'s exception), §5 row 7 split into "7a — the seam (built; this plan)" and
  "7b — the physical split (weeks → days; `plans/PLAN.md` Phase 24)", §7 "sharding is a
  repository concern" reworded to "a repository and DI-root concern", §8 diagrams gain the
  catalog, §9 "do not do this week" keeps *running* a second shard. `docs/ai/rules/data.md`
  gains the placement rule and the "reads that cross run before the transaction" rule;
  `docs/ai/rules/layering.md` unchanged (nothing crosses a layer); `docs/opinions/classes.md`
  role nouns unchanged (`Strategy`, `Policy`, `Resolver`, `Repository` all exist);
  `docs/setup/13`, `17`, `24`, `25`, `26`, `29`; `apps/web/docs/reference/env.md`,
  `apps/worker/docs/reference/env.md` (the shard block); `docs/infra/reference/postgres.md`.

- [ ] `22.22` **Verify** — `pnpm build:packages && pnpm --filter @loadbearing/web build`;
  `pnpm check:architecture` 23/23 no skip; `pnpm typecheck && pnpm lint && pnpm test`;
  `pnpm infra:up && pnpm db:migrate && pnpm db:seed`; `pnpm --filter @loadbearing/infrastructure
  test` (every Postgres suite now runs through `DatabaseCluster` with one shard); `pnpm smoke`;
  then `pnpm infra:up:sharded` with the two env lines and `pnpm smoke` again to watch
  `sharded.spec.ts` fail on the foreign key and nothing else.

#### Dropped

- [-] `22.23` **`ShardMap`** `dropped: 2026-09-16` — decision D28 — the shard is the organization; there is no 256 layer to map.

**Exit.** With one physical shard: every suite green, `check:architecture` 23/23; a repository
given the wrong placement fails its first spec with the tripwire's message; an oRPC call with no
key in scope to a routed procedure is impossible by construction (`authed` chains the middleware)
and a direct `routedUnitOfWork.run` without one throws; `shard_assignments` holds one row per
organization after `db:migrate` and gains one on every organization created; `curl /health` shows
`database: { "0": true }`. With `infra:up:sharded` and the two env lines: `db:migrate` migrates
both, `/health` shows two shards, and `sharded.spec.ts` fails on exactly the foreign-key
constraint `24.1` names.

---

---

## Phase 23 — Loose ends — no gate, any spare hour

Nothing here waits on anything and nothing waits on it. Four are fixes found while walking
earlier Exit lines, eight are Exit clauses that can only be proven in a browser, and three are
standalone tasks that used to live in `TODO.md`. Take one when a build is waiting on CI.

#### Fixes found on the way

- [ ] `23.1` **The `jobId` duplicate-suppression window is about five seconds, not
  `removeOnCompleteAgeSeconds`.** BullMQ trims a queue's completed set when *any* job on it
  completes, to that job's own `removeOnComplete`. `OutboxDrainSchedule` runs every second with
  `removeOnComplete: 10` on the same `EVENT` queue, so it evicts the `deliver` jobs within a few
  ticks — measured: two `deliver` entries present at t+1s, gone by t+5s, while
  `removeOnCompleteAgeSeconds` asks for 86 400.
  `10.8`'s note reasons that "that age *is* the duplicate-suppression window and belongs in the
  port"; that reasoning is wrong as built, and the note should say so whatever is decided here.
  **It is not a correctness bug** — the subscriber contract is idempotent on `event.id`, the
  notification dedupe index holds, and the client dedupes messages by id; a re-run costs a
  duplicate cache-invalidation frame. Three options, none obviously right: put the drain's repeat
  job on its own queue so its trim cannot reach deliveries; raise the drain's `removeOnComplete`
  past the expected delivery volume (moves the number, does not fix the shape); or accept a
  seconds-long window, which covers the race the design actually targets — a drain that claimed
  rows and died before marking them — and correct the note.

- [ ] `23.2` **`pnpm smoke` publishes a probe job onto the live `MAINTENANCE` queue.** With a
  worker running, that worker picks it up and logs
  `queue.job.failed {jobId: "smoke-unnamed"}` — the consumer rejects a job name it does not know,
  correctly. Harmless, and confusing the first time. Either the smoke suite should use a queue
  name no consumer listens on, or `docs/setup` should say to run it with the worker stopped.

- [ ] `23.3` **The QueryClient is not dehydrated, so every loader prefetch is thrown away.**
  `getRouter`'s `dehydrate` carries messages, session and appearance — not the query cache. SSR
  renders `Members: 3`, the client hydrates the same node as `Loading…` and refetches. Measured
  from the live hydration diff, and it makes `11.14`'s "the loader prefetches page 1" false in
  the browser however true it is on the server.
  **It needs a decision, which is why it is filed rather than fixed.** The fix is four lines —
  `dehydrate(queryClient)` into the payload, `hydrate(queryClient, …)` back out, and react-query
  5.101.4 already exports both, so **no new dependency is required to make it work**. What it
  does not pass is the *type*: TanStack Router validates the payload with
  `ValidateSerializableMapped`, and react-query's `queryKey`/`mutationKey` are `readonly
  unknown[]`, which the validator cannot prove serializable. So it is one of:
  **(a)** add `@tanstack/react-router-ssr-query` — the official integration, and a Tier 3
  dependency by `dependencies.md` (it names the router), quarantined to `apps/web`;
  **(b)** one cast at the boundary with a comment saying the values are serializable and the
  type cannot show it — no dependency, and the repo dislikes exactly this kind of cast;
  **(c)** `JSON.stringify` the payload, which is **wrong** — it flattens `Date` to a string, and
  that is the shape of two defects already fixed this week (`d1ccb5b`, `e644ed0`).
  A branch attempting (a)-without-the-package was written and reverted; the type error is
  recorded above so nobody re-derives it.

- [ ] `23.4` **worker requires SMTP for a digest it never sends** `P2` `~4h`
  - **Goal:** `env.ts` requires `SMTP_URL`/`EMAIL_FROM` "for the scheduled digest";
    `DigestComposer` is constructed only in its spec; `QueueName.NOTIFICATION` and
    `QueueName.DOCUMENT` have no consumer or producer.
  - **Done when (recommended: ship):** `NotificationConsumer` on `QueueName.NOTIFICATION`
    sends the digest through `container.email`; `digest.schedule.ts` enqueues daily;
    `QueueName.DOCUMENT` is deleted (or claimed by `5.5`). Alternative: delete composer,
    queue names and the two env keys from the worker schema.
  - **Docs:** `docs/setup/25`, `apps/worker/docs/reference/consumers.md`.
  - **Deferred by decision on 2026-09-06, not by oversight.** The facts, so this is not re-derived:
    nothing in the worker sends mail — both mailers are constructed inside `Container`'s
    `config.auth` branch, which the worker has no auth block for — so `SmtpEmailSender` is built and
    disposed without ever being called. `DigestComposer` is 31 lines constructed only by its own
    spec, `NOTIFICATION` and `DOCUMENT` have no consumer or producer (`5.5` indexed documents
    through `EMBEDDING`, so `DOCUMENT` stayed unclaimed), and `email.digest.*` is 24 keys in two
    locales.
  - **The entry's recommendation to ship is the half worth arguing with.** A digest needs a
    recipient list — there is no port for "members to notify" — a definition of what `count` counts,
    since nothing in the schema models unread, and an opt-out. That is product work, not a fix, and
    `docs/ai/rules/simplicity.md` is explicit about not building it in advance. Deletion is the
    other half of the entry and remains available.

#### Exit clauses that still need a browser

- [ ] `23.5` **The inviter's second tab refetches the member list without a reload**
  Phase 10's Exit line, the one clause that needs a browser. Invite from tab A with tab B on
  `/settings/members`; B shows the pending invitation without a reload.

- [ ] `23.6` **The loader's prefetch of page 1 and the unread count reach the browser**
  Phase 11, `11.14` — the procedures are exercised, the loader is not. Open the inbox cold and
  confirm the first page and the bell count render from the loader, not from a client refetch;
  `23.3` is what currently defeats this.

- [ ] `23.7` **The bell count moves on refocus**
  Phase 11's Exit line. Create a notification for the signed-in user from a second session,
  switch back to the first tab, and watch the badge move without a reload.

- [ ] `23.8` **A row is marked read optimistically and stays read after refetch**
  Phase 11's Exit line. Click a row: it reads as read before the mutation returns and is still
  read once the list refetches.

- [ ] `23.9` **Killing the web process and restarting it reconnects the stream, and a `resync` frame arrives**
  Phase 12's Exit line. The reconnect is `EventSource`'s own, so nothing server-side can prove
  it; watch the network panel through one restart of the web process.

- [ ] `23.10` **A sent message appears optimistically**
  Phase 13's Exit line. Send from tab A on a throttled connection; the message renders before
  the mutation returns and is reconciled, not duplicated, when it does.

- [ ] `23.11` **Typing indicator clears**
  Phase 13's Exit line. Type in tab A, stop; tab B's "… is typing" disappears within the
  indicator's timeout without a further keystroke.

- [ ] `23.12` **Record the walk**
  When the seven above are ticked, tick the matching clauses in `archive/COMMUNICATION-PLAN.md`'s
  Exit blocks and close `T-036` in `TODO.md` — the ledger row says the walk is what closes it.

#### From `TODO.md`

- [ ] `23.13` **Assert that every event code has an emitter** `P3` `~1h` `#tooling`
  - **Goal:** `5.14` found eight of twenty-four declared codes with no production call site. A
    declared code that nothing emits is a dashboard panel that stays empty forever, and an empty
    panel is indistinguishable from a healthy system. The catalog is clean today and nothing stops
    it drifting again.
  - **Done when:** `check-architecture.mjs` gains an assertion — every key in `EVENT_CATALOG` has at
    least one `logger.emit("<code>"` outside `core.events.ts`, `event-shape.ts` and `tests/`. The
    grep is the one `5.14` used:
    `grep -rn '"<code>"' packages apps --include=*.ts | grep -v node_modules | grep -v dist`.
  - **Notes:** deliberately not done inside `5.14`. A new assertion means renumbering "fifteen
    assertions" across `docs/ai/rules/workflow.md`, `docs/setup/26`, `AGENTS.md` and the `TODO.md`
    state table, which is churn worth doing once rather than mid-phase. The same shape would serve
    `permissions`: every key in `CATALOG` used by at least one `PROCEDURE_PERMISSIONS` entry, which
    is Phase 5's own exit criterion.

- [ ] `23.14` **Bring back an analytics reader, with the first dashboard** `P3` `~8h` `#api` `#db`
  - **Goal:** Nothing reads the analytics store. `5.12` deleted `AnalyticsReader`, both its
    implementations, its two rollup tables and the `ANALYTICS_DRIVER` flag, because nothing ever
    called any of it — a shape guessed at with no consumer to check it against, kept in step by hand
    across two adapters. The write half stayed: `AnalyticsProjector` fills `activity_events` and the
    nightly reconciliation checks it.
  - **The trigger, and it is not "the table is large".** Snapshot tables stop covering the questions
    people ask — the specific moment somebody wants an aggregate nobody precomputed.
  - **Do it in this order**, which is the whole point of having deleted the seam: set
    `CLICKHOUSE_URL` and let the projection fill and reconcile for days first, then write the reader
    against a store with real data in it and a dashboard with a real query.
  - **Four decisions carry over** and should not be re-litigated:
    - It is a **new port**, separate from `AnalyticsProjector`. A single port with both would put
      `project()` on the object a dashboard query holds.
    - **Read-only by construction.** A write method is the moment a derived store becomes
      authoritative ([Data and scale](../docs/opinions/data-and-scale.md) §2).
    - **Any permitted scope arrives resolved**, as `VectorStore.search()` takes `goalIds`. A remote
      analytics store holds no `CapabilitySet` and can join back to nothing.
    - **Periods are ISO `YYYY-MM-DD` strings**, not `Date`s: `date_trunc` and `toYYYYMM` return
      different shapes and each adapter normalises.
  - **A driver flag comes back only if a second implementation does**, and only once the first has a
    caller. Its absence is currently a feature — a flag that moved reads the moment the pipeline
    started would cut a dashboard over to a store that is still backfilling.

- [ ] `23.15` **The English fallback layer is now dead payload** `P3` `~3h` `#ui`
  - **Goal:** `StaticContentSource` loads English *beneath* every locale, per namespace, so a key
    the locale had not translated still rendered a sentence. `5.9` made `NamespaceBundle` a total
    `Record`, so a bundle with a gap no longer compiles — and the layer beneath it can no longer be
    reached by anything that ships.
  - **What it costs:** every non-English page carries both copies. Measured on `/sign-in` under
    `locale=bn`: the dehydrated payload holds the full `common` + `error` + `auth` English bundle
    *and* the full Bengali one, roughly doubling the message bytes on the wire and in memory.
  - **Why this is not just "delete it".** The layer is also what makes a *partially loaded* set of
    namespaces work, and it is the safety net if copy ever arrives from somewhere `tsc` does not
    see — a CMS behind `ContentSource`, which is the swap that seam exists for. Removing it makes
    adding a locale all-or-nothing at runtime as well as at compile time, which is a real barrier
    to a contributor landing a third language incrementally.
  - **Done when:** one of two decisions is made and written down — either the base layer is dropped
    for a locale whose bundles are statically known total (and `StaticContentSource` gains the test
    that proves it), or the totality of `NamespaceBundle` is relaxed back to `Partial` with a
    `check-architecture` assertion counting the gap instead. Do not ship both.

---

## Phase 24 — The physical split 📁

Filed, not built. Every item is the decision or the mechanism a second physical node needs, written
down so the seam in Phase 22 is judged against a real target rather than a feeling.

- [ ] `24.1` **The foreign-key decision.** Two shapes, decided when a second shard is actually
  provisioned: **(a)** drop every FK from a routed table to a catalog table, replace tenant
  delete with a maintenance job that sweeps routed rows by `organization_id` per shard, and add a
  nightly reconciliation that counts orphans; or **(b)** logically replicate the catalog tables
  to every shard (`CREATE PUBLICATION` on shard 0, `CREATE SUBSCRIPTION` on each) so the FKs
  hold against local copies, accepting that a membership written milliseconds after a user is
  created can race the apply. (a) is what most sharded systems do; (b) is what keeps
  `ON DELETE CASCADE` meaning something. Whichever lands empties `CROSS_PLACEMENT_KNOWN`.
  `verified: 2026-09-13, second pass` — the inventory the decision is about, from the schema
  files. Nine FKs from routed to catalog tables, all `cascade`: `notification.schema.ts:26,32,86,90`,
  `messaging.schema.ts:26,58,69,96`, `vector.schema.ts:24`. Two routed→routed, `no action`:
  `conversation_members.conversation_id` and `messages.conversation_id` (`messaging.schema.ts:64,100`)
  — unaffected by the split, they stay on one shard. Two deliberate non-FKs already in the shape
  option (a) produces: `messages.author_id` (`messaging.schema.ts:101-103`) and
  `notifications.event_id` (`notification.schema.ts:33-35`). Option (a) drops nine constraints
  and has to replace nine cascades with one sweep.

- [ ] `24.2` **Tenant move** as a `MaintenanceConsumer` job: `shard_assignments.moving_to` (a node),
  create the tenant's partitions on the target (`ensureTenantPartitions`, `16.4`), copy each tenant
  partition's rows in keyset batches, verify counts per table, flip `node`, `resolver.invalidate`,
  drop the source tenant partitions after a grace period. The write freeze during the flip is a
  `ForbiddenError` from `shardMiddleware` for that key. `revised: 2026-09-16` — decision D28; and
  `24.8`'s filed ClickHouse note is resolved by `16.6`: the checkpoint is per tenant and ClickHouse
  is not per node, so a moved tenant resumes where it was.

- [ ] `24.3` **Read replica per shard** — `DATABASE_SHARD_<n>_REPLICA_URL`, `cluster.reader(key)`,
  the dashboard and analytics reads moved onto it; §5 row 3. The admin's view of it — health, lag,
  and the switch — is `25.1`–`25.2` and waits on this.

- [ ] `24.4` **The catalog is the last single primary** — measure first: capability and shard
  resolution are both cached; the catalog's write rate is sign-ups and role edits. If it hurts,
  a replica for its reads before anything else.

- [ ] `24.5` **Two-node proof** — `sharded.spec.ts` green is this phase's Exit, plus a tenant
  move under load with no lost writes.

- [ ] `24.6` **Load test** the routed paths at 10× against the sharded compose profile before any
  of this is called production-ready.

- [ ] `24.7` **A pooled partition for the long tail** — filed 2026-09-17 with `16.12`. Every tenant
  costs about fifty relations whether it holds ten rows or ten million, and the `personal`
  enrolment mode lets anyone create one. A list partition may hold many values, so small tenants
  can share one `<table>_pool` partition (`for values in (a, b, c, …)`, months underneath as usual)
  and graduate to their own when they cross a size line: create the new partition, copy the
  tenant's rows, detach the pool, recreate it without that value, re-attach — a rare operation
  under a write freeze for that tenant, the same freeze `24.2` uses. `PartitionedTable` gains
  nothing; the seed and the maintenance gateway learn a second placement, "pool", and the directory
  row records which. Not built until `16.12`'s number says it is needed.

- [-] `24.8` **Virtual-shard move** `dropped: 2026-09-16` — decision D28 — a tenant moves as one partition set (`24.2`); there is no virtual shard to move.

- [-] `24.9` **`messages` partitioning** `dropped: 2026-09-15` — decision D26 — absorbed into `16.2`; the table is partitioned now, not at a trigger.

---

## Phase 25 — The replica panel and the shard map 📁

**Depends on:** Phase 22 for the map (`22.3`, `22.4`); `24.2` for the move
button's procedure; `24.3` for the replica handle and `cluster.reader(key)`.

- [ ] `25.1` **Status** — `InspectPlatformStatusUseCase` grows `replica: { healthy, lagSeconds } | null`
  from the cluster's replica handle (`now() - pg_last_xact_replay_timestamp()`), rendered on
  `/platform/status`. Nothing to switch yet.

- [ ] `25.2` **The switch** — `platform_policy.replica_reads_enabled` (decision D43; the column is
  created in `20.8` and read by nothing until here), `toggle-replica-reads.use-case.ts` under a
  `platform.replica.manage` key registered with `24.3`, which is also what decides what reads route
  there (worker batch reads first, web never in the first cut). Until then a switch would switch
  nothing, so the use-case and the control land with `24.3`.

- [ ] `25.3` **Colder storage class** — a `transitionAfterDays` and storage class on `LifecycleRule`,
  once someone pays for Glacier; MinIO needs a configured tier to honour it, which is why it is not
  in Phase 19.

- [ ] `25.4` **The shard map** — `inspect-shard-map.use-case.ts` (`platform.shards.read`): one row per
  physical node — tenant count from `shard_assignments` grouped by `node`, most recent `assigned_at`
  — with the tenants of a node on expand, paginated, each tenant row carrying its retention override
  (`19.19`), the move button (`25.5`) and the delete action (`19.20`); plus a tenant lookup
  (organization id or slug → its node). `revised: 2026-09-16` — the shard is the organization. The output
  carries `moves: "unavailable" | "available"` from `container.hasShardMoves`, a getter that is a
  constant `false` with the comment until `24.2` registers the move job; the seam earns its place
  because the retrofit touches contract, screen and use-case (decision D46). Procedure `shards.map`,
  route `/platform/shards`, `shard-map.panel.tsx`. **Docs:** `platform.md`, `sharding.md` (from `22.21`).

- [ ] `25.5` **The move button** — rendered on every tenant row; disabled with the copy "tenant moves
  need the physical split; Phase 24" while `moves === "unavailable"`.
  `move-tenant.use-case.ts` (`platform.shards.manage`; input `{ organizationId, toNode }`;
  records `platform.tenant.move_requested`; enqueues `24.2`'s job) and the `shards.move` procedure
  **land with `24.2`**, in that commit, and flip `hasShardMoves`. **Docs:** `sharding.md`.

**Exit (the built part).** `/platform/shards` renders one row for node 0 on the single-node compose
stack with the seeded tenants underneath, the move button disabled with its reason; the tenant lookup
finds the seeded organization.

---

---

## Phase 26 — Communication follow-ups 📁

Filed, not built. Each item names the trigger that would promote it; `26.8`, the load test, is the
one worth promoting without a trigger.

- [ ] `26.1` **Threads, reactions, attachments** — `messages.parent_id` (NO ACTION, indexed),
  `message_reactions`, uploads through the existing `StorageGateway.presignUpload` with a
  `message_attachments` table; each its own slice increment.

- [ ] `26.2` **`Popover` in `ui`** so the bell opens an inline list rather than a page.

- [ ] `26.3` **Web push** — a `PushPublisher` port beside `MailPublisher`; lands with its first
  adapter and `Container` line or not at all (`5.11`'s rule).

- [ ] `26.4` **Message archive** — partitions older than N months streamed to S3 the way
  `PgActivityArchiveGateway` does, behind a per-tenant retention setting.

- [ ] `26.5` **Redis Streams behind `RealtimeSubscriber`** — `XADD`/`XREAD` from
  `last-event-id`, which turns "invalidate on reconnect" into a real replay. Same port.

- [ ] `26.6` **Global stream cap and presence** — `INCR` with TTL per user in the cache Redis;
  `presence` derived from open streams.

- [ ] `26.7` **Per-tenant digest hour**, mention notifications for channels, notification
  grouping ("3 new messages from A").

- [ ] `26.8` **Load test** the three §6 paths at 10× (digest fan-out, notification write
  amplification, message fan-out) against the compose stack before any of this is called
  production-ready.

- [ ] `26.9` **Resend actions** — "resend invitation" and "resend verification". These are what
  cover the window between a commit and its enqueue, which decision D8 takes instead of a table.
  Small, and worth having before the first support question rather than after.

- [ ] `26.10` **A delivery log, if the question actually arrives.** The trigger is stated so it
  is not built on a feeling: somebody needs to answer "was this sent" and neither
  `mail.delivery.sent` in Loki nor the provider's own log can answer it — most likely because
  retention is shorter than the question. Build it then, as an append-only table written by the
  consumer, never as state the send path depends on.

- [ ] `26.11` **Move from SMTP to a provider API** (SES, Postmark, Resend). This is what buys
  bounce and complaint webhooks, suppression lists and a searchable sent log — the delivery record
  this plan deliberately does not keep. It is one adapter behind the existing `EmailSender` port,
  which is exactly the swap that port exists for; `docs/ai/rules/dependencies.md` would move the
  entry from Tier 0 (a protocol) to Tier 2 (an SDK behind a port).

---

## Verification — the whole plan

The command block under **Resume here**, then each phase's **Exit** line by hand. The one check that
cannot be automated is still the tier: sign in as a tenant owner who is not a platform admin and type
`/platform/retention` into the address bar — the redirect is the tier working.

---
## Where the old IDs went

Every ID the archive and the doc pages use, and the number it has here. Decisions: `C-n` is `Dn`,
`S-n` is `D(9+n)`, `A-n` is `D(29+n)`. Six IDs of the mail phase (`C1.5`, `C1.12`, `C1.13`, `C1.14`,
`C1.20`, `C1.21`) were retired before they were built and have no new number. `T-032` closed on
2026-09-13 with `C4.11` (now `12.12`) and is not carried.

**Phase 1** — `P1.1`→`1.1`, `P1.2`→`1.2`, `P1.3`→`1.3`, `P1.4`→`1.4`, `P1.5`→`1.5`, `P1.6`→`1.6`,
`P1.7`→`1.7`, `P1.8`→`1.8`, `P1.9`→`1.9`, `P1.10`→`1.10`, `P1.11`→`1.11`, `P1.12`→`1.12`.

**Phase 2** — `P2.1`→`2.1`, `P2.2`→`2.2`, `P2.3`→`2.3`, `P2.4`→`2.4`, `P2.5`→`2.5`, `P2.6`→`2.6`,
`P2.7`→`2.7`, `P2.8`→`2.8`, `P2.9`→`2.9`, `P2.10`→`2.10`, `P2.11`→`2.11`, `P2.12`→`2.12`,
`P2.13`→`2.13`, `P2.14`→`2.14`, `P2.15`→`2.15`, `P2.16`→`2.16`, `P2.17`→`2.17`, `P2.18`→`2.18`,
`P2.19`→`2.19`, `P2.20`→`2.20`, `P2.21`→`2.21`, `P2.22`→`2.22`, `P2.23`→`2.23`, `P2.24`→`2.24`,
`P2.25`→`2.25`, `P2.26`→`2.26`.

**Phase 3** — `P3.1`→`3.1`, `P3.2`→`3.2`, `P3.3`→`3.3`, `P3.4`→`3.4`, `P3.5`→`3.5`, `P3.6`→`3.6`,
`P3.7`→`3.7`, `P3.8`→`3.8`, `P3.9`→`3.9`, `P3.10`→`3.10`, `P3.11`→`3.11`, `P3.12`→`3.12`,
`P3.13`→`3.13`, `P3.14`→`3.14`, `P3.15`→`3.15`, `P3.16`→`3.16`, `P3.17`→`3.17`, `P3.18`→`3.18`,
`P3.19`→`3.19`, `P3.20`→`3.20`, `P3.21`→`3.21`.

**Phase 4** — `P4.1`→`4.1`, `P4.2`→`4.2`, `P4.3`→`4.3`, `P4.4`→`4.4`, `P4.5`→`4.5`, `P4.6`→`4.6`,
`P4.7`→`4.7`, `P4.8`→`4.8`, `P4.9`→`4.9`, `P4.10`→`4.10`, `P4.11`→`4.11`, `P4.12`→`4.12`,
`P4.13`→`4.13`, `P4.14`→`4.14`, `P4.15`→`4.15`, `P4.16`→`4.16`, `P4.17`→`4.17`, `P4.18`→`4.18`,
`P4.19`→`4.19`, `P4.20`→`4.20`, `P4.21`→`4.21`, `P4.22`→`4.22`, `P4.23`→`4.23`, `P4.24`→`4.24`,
`P4.25`→`4.25`, `P4.26`→`4.26`, `P4.27`→`4.27`.

**Phase 5** — `P5.1`→`5.1`, `P5.2`→`5.2`, `P5.3`→`5.3`, `P5.4`→`5.4`, `P5.5`→`5.5`, `P5.6`→`5.6`,
`P5.7`→`5.7`, `P5.8`→`5.8`, `P5.9`→`5.9`, `P5.10`→`5.10`, `P5.11`→`5.11`, `P5.12`→`5.12`,
`P5.13`→`5.13`, `P5.14`→`5.14`, `P5.15`→`5.15`, `P5.16`→`5.16`.

**Phase 6** — `P6.1`→`6.1`, `P6.2`→`6.2`, `P6.3`→`6.3`, `P6.4`→`6.4`, `P6.5`→`6.5`, `P6.6`→`6.6`,
`P6.7`→`6.7`, `P6.8`→`6.8`.

**Phase 7** — `P7.1`→`7.1`, `P7.2`→`7.2`, `P7.3`→`7.3`, `P7.4`→`7.4`, `P7.5`→`7.5`, `P7.6`→`7.6`,
`P7.7`→`7.7`, `P7.8`→`7.8`, `P7.9`→`7.9`, `P7.10`→`7.10`, `P7.11`→`7.11`, `P7.12`→`7.12`,
`P7.13`→`7.13`, `P7.14`→`7.14`, `P7.15`→`7.15`, `P7.16`→`7.16`.

**Phase 8** — `P8.1`→`8.1`, `P8.2`→`8.2`, `P8.4`→`8.3`, `P8.5`→`8.4`, `P8.6`→`8.5`, `P8.7`→`8.6`,
`P8.8`→`8.7`, `P8.9`→`8.8`, `P8.10`→`8.9`, `P8.11`→`8.10`, `P8.12`→`8.11`, `P8.13`→`8.12`,
`P8.14`→`8.13`, `P8.15`→`8.14`, `P8.16`→`8.15`, `P8.17`→`8.16`, `P8.18`→`8.17`, `P8.19`→`8.18`,
`P8.20`→`8.19`, `P8.21`→`8.20`, `P8.22`→`8.21`, `P8.23`→`8.22`.

**Phase 9** — `C1.1`→`9.1`, `C1.2`→`9.2`, `C1.3`→`9.3`, `C1.4`→`9.4`, `C1.6`→`9.5`, `C1.7`→`9.6`,
`C1.8`→`9.7`, `C1.9`→`9.8`, `C1.10`→`9.9`, `C1.11`→`9.10`, `C1.15`→`9.11`, `C1.16`→`9.12`,
`C1.17`→`9.13`, `C1.18`→`9.14`, `C1.19`→`9.15`, `C1.22`→`9.16`, `C1.23`→`9.17`, `C1.24`→`9.18`,
`C1.25`→`9.19`.

**Phase 10** — `C2.1`→`10.1`, `C2.2`→`10.2`, `C2.3`→`10.3`, `C2.4`→`10.4`, `C2.5`→`10.5`,
`C2.6`→`10.6`, `C2.7`→`10.7`, `C2.8`→`10.8`, `C2.9`→`10.9`.

**Phase 11** — `C3.0`→`11.1`, `C3.1`→`11.2`, `C3.2`→`11.3`, `C3.3`→`11.4`, `C3.4`→`11.5`,
`C3.5`→`11.6`, `C3.6`→`11.7`, `C3.7`→`11.8`, `C3.8`→`11.9`, `C3.9`→`11.10`, `C3.10`→`11.11`,
`C3.11`→`11.12`, `C3.12`→`11.13`, `C3.13`→`11.14`, `C3.14`→`11.15`, `C3.15`→`11.16`,
`C3.16`→`11.17`.

**Phase 12** — `C4.1`→`12.1`, `C4.2`→`12.2`, `C4.3`→`12.3`, `C4.4`→`12.4`, `C4.5`→`12.5`,
`C4.6`→`12.6`, `C4.7`→`12.7`, `C4.8`→`12.8`, `C4.9`→`12.9`, `C4.8b`→`12.10`, `C4.9b`→`12.11`,
`C4.11`→`12.12`.

**Phase 13** — `C5.1`→`13.1`, `C5.2`→`13.2`, `C5.3`→`13.3`, `C5.4`→`13.4`, `C5.5`→`13.5`,
`C5.6`→`13.6`, `C5.7`→`13.7`, `C5.8`→`13.8`, `C5.9`→`13.9`, `C5.10`→`13.10`, `C5.11`→`13.11`,
`C5.12`→`13.12`, `C5.13`→`13.13`, `C5.14`→`13.14`.

**Phase 14** — `S1.1`→`14.1`, `S1.2`→`14.2`, `S1.3`→`14.3`, `S1.4`→`14.4`, `S1.5`→`14.5`,
`S1.6`→`14.6`, `S1.7`→`14.7`, `S1.8`→`14.8`, `S1.9`→`14.9`, `S1.10`→`14.10`, `S1.11`→`14.11`,
`S1.12`→`14.12`, `S1.13`→`14.13`.

**Phase 15** — `S2.1`→`15.1`, `S2.2`→`15.2`, `S2.3`→`15.3`, `S2.4`→`15.4`.

**Phase 16** — `S2.5`→`16.1`, `S2.6`→`16.2`, `S2.20`→`16.3`, `S2.21`→`16.4`, `S2.22`→`16.5`,
`S2.23`→`16.6`, `S2.24`→`16.7`, `S2.19`→`16.8`, `S2.7`→`16.9`, `S2.8`→`16.10`, `S2.25`→`16.11`,
`S2.26`→`16.12`, `S2.18`→`16.13`, `S2.9`→`16.14`.

**Phase 17** — `S2.10`→`17.1`, `S2.11`→`17.2`, `S2.12`→`17.3`, `S2.13`→`17.4`, `S2.14`→`17.5`,
`S2.16`→`17.6`, `S2.17`→`17.7`, `S2.15`→`17.8`.

**Phase 18** — `A1.1`→`18.1`, `A1.2`→`18.2`, `A1.3`→`18.3`, `A1.4`→`18.4`, `A1.5`→`18.5`,
`A1.6`→`18.6`, `A1.7`→`18.7`, `A1.8`→`18.8`, `A1.9`→`18.9`, `A1.10`→`18.10`, `A1.11`→`18.11`,
`A1.12`→`18.12`, `A1.13`→`18.13`, `A1.14`→`18.14`.

**Phase 19** — `A2.1`→`19.1`, `A2.2`→`19.2`, `A2.3`→`19.3`, `A2.4`→`19.4`, `A2.5`→`19.5`,
`A2.6`→`19.6`, `A2.7`→`19.7`, `A2.8`→`19.8`, `A2.9`→`19.9`, `A2.10`→`19.10`, `A2.11`→`19.11`,
`A2.12`→`19.12`, `A2.13`→`19.13`, `A2.14`→`19.14`, `A2.15`→`19.15`, `A2.16`→`19.16`,
`A2.17`→`19.17`, `A2.18`→`19.18`, `A2.19`→`19.19`, `A2.20`→`19.20`, `A2.21`→`19.21`.

**Phase 20** — `A3.1`→`20.1`, `A3.2`→`20.2`, `A3.3`→`20.3`, `A3.4`→`20.4`, `A3.5`→`20.5`,
`A3.6`→`20.6`, `A3.7`→`20.7`, `A3.8`→`20.8`, `A3.9`→`20.9`, `A3.10`→`20.10`, `A3.11`→`20.11`.

**Phase 21** — `S5.1`→`21.1`, `S5.2`→`21.2`, `S5.3`→`21.3`, `S5.4`→`21.4`, `S5.5`→`21.5`,
`S5.6`→`21.6`.

**Phase 22** — `S3.1`→`22.1`, `S3.2`→`22.2`, `S3.3`→`22.3`, `S3.5`→`22.4`, `S3.6`→`22.5`,
`S3.7`→`22.6`, `S3.8`→`22.7`, `S3.9`→`22.8`, `S3.10`→`22.9`, `S3.23`→`22.10`, `S3.11`→`22.11`,
`S3.12`→`22.12`, `S3.13`→`22.13`, `S3.14`→`22.14`, `S3.15`→`22.15`, `S3.16`→`22.16`,
`S3.17`→`22.17`, `S3.18`→`22.18`, `S3.19`→`22.19`, `S3.20`→`22.20`, `S3.21`→`22.21`,
`S3.22`→`22.22`, `S3.4`→`22.23`.

**Phase 23** — `C2.10`→`23.1`, `C2.11`→`23.2`, `C4.10`→`23.3`, `P8.3`→`23.4`, `X1`→`23.5`,
`X2`→`23.6`, `X3`→`23.7`, `X4`→`23.8`, `X5`→`23.9`, `X6`→`23.10`, `X7`→`23.11`, `X8`→`23.12`,
`T-033`→`23.13`, `T-034`→`23.14`, `T-035`→`23.15`.

**Phase 24** — `S4.1`→`24.1`, `S4.2`→`24.2`, `S4.4`→`24.3`, `S4.5`→`24.4`, `S4.6`→`24.5`,
`S4.8`→`24.6`, `S4.9`→`24.7`, `S4.3`→`24.8`, `S4.7`→`24.9`.

**Phase 25** — `A4.1`→`25.1`, `A4.2`→`25.2`, `A4.3`→`25.3`, `A4.4`→`25.4`, `A4.5`→`25.5`.

**Phase 26** — `C6.1`→`26.1`, `C6.2`→`26.2`, `C6.3`→`26.3`, `C6.4`→`26.4`, `C6.5`→`26.5`,
`C6.6`→`26.6`, `C6.7`→`26.7`, `C6.8`→`26.8`, `C6.9`→`26.9`, `C6.10`→`26.10`, `C6.11`→`26.11`.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-17 | @sami | Rewritten as one chronological file: 26 phases numbered in build order, every item `<phase>.<item>`, decisions `D1`–`D50`. Built phases carry one dated line per item; open items keep their text verbatim from the 2026-09-17 consolidation. `T-033`–`T-035` moved in from `TODO.md` as `23.13`–`23.15`; the eight unmet client-side Exit clauses became `23.5`–`23.12`. `archive/` is untouched and still holds the old IDs, so the nine doc and code comments and eleven links that cite them still resolve and are left as they are |
| 2026-09-17 | @sami | `P2.20` (now `2.20`) closed as moot: its dependency `P5.15` had deleted the component. 120 open |
| 2026-09-17 | @sami | Consolidated the open items of four plans into one file — 121 items, IDs unchanged. The five plan files moved to `archive/` verbatim |

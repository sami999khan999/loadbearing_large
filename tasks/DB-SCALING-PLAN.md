---
title: Database scaling plan — connection pooling, partitioning, virtual sharding
updated: 2026-09-13
owner: sami
schema: plan/v1
source: tree at c72ca9e (claude/sleepy-franklin-yqa9av), 2026-09-13
---

# Database scaling plan

> **How to use this file**
>
> 1. Every item has a unique ID (`S1.3`). Never reuse or renumber one.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing, and
>    `unverified:` naming the command when the proof needs a container the executor lacks.
> 3. Phases run in order. A phase may start when the previous phase's **Exit** line is true.
>    Inside a phase, checklists run top to bottom; items inside one are independent unless
>    **Depends on** says otherwise.
> 4. Every item that touches code lists the doc it must update. A code change with the doc
>    untouched is not done. `docs/opinions/` wins over `docs/ai/rules/`; if a rule file is made
>    stale by an item, update both in the same commit (`check-architecture` §12 checks).
> 5. Every table follows `docs/ai/rules/data.md`; every new file role is in the closed suffix
>    table (this plan adds none); every new folder name is a row in `docs/opinions/folders.md`
>    in the same commit (this plan adds one: `shard/` in `composition`).
> 6. `tasks/TODO.md` stays the task ledger: `T-037` points here. Defects found while executing
>    go to the bottom of the relevant phase.
> 7. Commit per layer with the closed `scope-enum` in `commitlint.config.js`. No scope is added:
>    this plan adds no package. No author or tool trailers (`docs/ai/rules/workflow.md`).

---

## Context

The kit runs one `pg.Pool` per process, ten connections, and nothing outside
`packages/infrastructure/src/pg/primitive/database.ts` can change that: `ContainerConfig.database`
carries a `maxConnections?` that neither `apps/web/src/env.ts` nor `apps/worker/src/env.ts` sets,
`statementTimeoutMs` never reaches the config at all, and the worker's six consumers default to
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

This file is the plan: four phases in the shape of `COMMUNICATION-PLAN.md`.

### Decisions recorded up front (do not re-litigate)

1. **The routing key is a `ShardKey` the strategy derives; the default strategy derives it from
   `organization_id`.** Nothing else is on every table, so nothing else can route a query. A fork
   that needs a different key (store, workspace, region) writes one `ShardingStrategy` in
   `packages/composition/src/shard/` and adds its key column to its own tables. Use-cases never
   see any of it (`data-and-scale.md` §7 holds).
2. **256 virtual shards, fixed forever.** `VirtualShard.COUNT` is a constant nobody edits: the
   directory makes changing it unnecessary, and changing it would re-place every key.
3. **Placement is a directory row, not a hash.** `shard_assignments (shard_key, virtual_shard)`
   on the catalog, written once per key by the `ShardPlacementPolicy` the container binds
   (default `HashShardPlacementPolicy`: FNV-1a over the key, even spread, no state). Moving one
   tenant is rewriting one row; moving a virtual shard is editing one env entry. A key with no
   row is an `InternalError` — the backfill migration and the founder together mean it cannot
   happen, and a lazy insert on the read path would hide the case where it did.
4. **Physical shard 0 is the catalog and always exists.** It is `DATABASE_URL`. Every physical
   shard carries the full schema (one migration set, looped), so catalog tables exist empty on
   shards 1+; that is harmless and is what keeps `migrate.ts` a loop rather than a branch.
5. **Three placements, and every table has exactly one.** `catalog` — the tables a principal is
   built from before a key is known, plus RBAC and the two tenant-less lookups: `users`,
   `accounts`, `sessions`, `verifications`, `two_factors`, `organizations`, `memberships`,
   `roles`, `role_permissions`, `goal_members`, `permission_overrides`, `invitations`, `api_keys`,
   `shard_assignments`, `activity_archive`. `local` — present on every physical database and
   written in whichever transaction is open: `activity_log`, `outbox_event`. `routed` — everything
   a tenant produces: `notifications`, `notification_preferences`, `conversations`,
   `conversation_members`, `messages`, `document_chunks`, and every future slice. RBAC on the
   catalog is what keeps sign-in, the switcher, capability resolution and the founder flow each
   inside one transaction; the cost is that the catalog is the last single primary, and §4 files
   what to do about it.
6. **A transaction has one placement, and crossing it throws.** `TransactionScope` records the
   placement of the open transaction; a repository whose placement differs asks for `this.db`
   and gets an `InternalError`, on one node, in every environment. That is the tripwire that makes
   a single-Postgres deployment reveal every use-case a physical split would break. Reads that
   legitimately cross (a subscriber resolving recipients on the catalog, then writing routed
   notifications) run **before** the transaction opens, never inside it.
7. **Two `UnitOfWork` instances, bound per slice at the DI root.** The port stays
   `run(work)`; `Container` hands `catalogUnitOfWork` to the RBAC, member, invitation and API-key
   use-cases and `routedUnitOfWork` to notification, messaging and document use-cases. The routed
   one opens on the shard the ambient `ShardScope` names. Zero use-case changes, and a mis-binding
   fails the first spec that touches it.
8. **Foreign keys from routed tables to catalog tables stay** while physical shards = 1.
   Dropping them costs referential integrity today for a split that has not been triggered;
   `S4.1` is where that decision is made, with the two options stated.
9. **pgBouncer is always on locally, transaction mode.** `DATABASE_URL` points at `:6432`;
   `DATABASE_DIRECT_URL` at `:5432` is what migrations, `drizzle-kit`, the seed and the archive
   DDL use. pgBouncer is Tier 0 (`docs/opinions/dependencies.md`): the deployment runs it, no
   manifest names it, and a managed pooler replaces it in production without a code change.
10. **Timeouts move server-side.** `pg` sends `statement_timeout` as a startup parameter, which a
    transaction-mode pooler must be told to ignore — and then it is gone. `ALTER ROLE CURRENT_USER
    SET …` in a migration is the floor that survives the pooler; the worker's longer batch timeout
    is `SET LOCAL` inside `PgUnitOfWork.run`, which is transaction-scoped and therefore
    pooler-safe. The startup parameter stays for direct connections.
11. **`messages` stays unpartitioned.** The decision at `messaging.schema.ts` holds; `S2.5` records
    the trigger that reopens it rather than leaving it to a feeling.
12. **No new package, no new dependency, no new file suffix.** One new Tier 0 (pgBouncer), one new
    folder name (`shard/` in `composition`), three new `check-architecture` assertions (§21–§23),
    which makes the count twenty-three everywhere the docs say twenty.

### What exists and is reused (verified against the tree at `c72ca9e`)

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

---

## The phases

### Vocabulary fixed up front

| Thing | Name |
|---|---|
| Env, pool (both `env.ts`) | `DATABASE_URL` (pooled), `DATABASE_DIRECT_URL`, `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS`, `DATABASE_POOL_CONNECT_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS` |
| Env, shards | `DATABASE_SHARD_<n>_URL`, `DATABASE_SHARD_<n>_DIRECT_URL`, `DATABASE_SHARD_<n>_VIRTUAL` (`128-255`, or `1,7,9-20`), `n ≥ 1` |
| Table (catalog) | `shard_assignments` |
| Primitives (`application/src/primitive/`) | `ShardKey`, `VirtualShard`, `Placement` (`"catalog" \| "local" \| "routed"`), `CatalogTable`, `PartitionedTable` (grows `column`, `retentionMonths`) |
| Ports (`application/src/port/`) | `ShardingStrategy`, `ShardPlacementPolicy`, `ShardResolver`, `ShardAssignmentRepository` |
| Infrastructure (`pg/primitive/`) | `ShardMap`, `DatabaseCluster` |
| Infrastructure (`pg/transaction/`) | `ShardScope`, `TransactionScope` (carries placement) |
| Infrastructure (`pg/repository/`) | `PgShardResolver`, `PgShardAssignmentRepository` |
| Composition (`src/shard/`, new folder) | `OrganizationShardingStrategy`, `HashShardPlacementPolicy` |
| Log event codes | `database.pool.saturated` (warn), `worker.pool.oversubscribed` (warn), `partition.runway.low` (warn), `shard.assignment.created` (info), `shard.resolution.failed` (error) |
| Scripts | `pnpm db:partitions`, `pnpm infra:up:sharded` |
| Compose services | `pgbouncer` (core), `postgres-shard-1` (profile `sharded`) |
| Assertions | §21 partition DDL ↔ allowlist · §22 one placement per repository file · §23 `new Database(` only in the cluster and the scripts |
| Docs pages (new) | `docs/infra/reference/pgbouncer.md`, `packages/infrastructure/docs/reference/sharding.md`, `packages/infrastructure/docs/reference/partitions.md` |

---

### Phase 1 — Connection pooling: the pool you can see, and the pooler in front of it

**Goal.** Every pool knob is an env var read once in `env.ts`, the pool's saturation is a log
line and a health field rather than a guess, the worker cannot silently oversubscribe its own
pool, and every local and production connection goes through pgBouncer in transaction mode with
the timeouts still enforced — proven by a smoke spec that runs the pooler-sensitive paths.

**Design in one paragraph.** `DatabaseConfig` already accepts `maxConnections` and
`statementTimeoutMs`; the change is plumbing them from `DATABASE_POOL_MAX` and friends through
`ContainerConfig.database` in both `env.ts` files, with the worker defaulting to a longer statement
timeout for batch work (`docs/setup/13` anticipates exactly this). `Database.stats()` exposes
`pg.Pool`'s `totalCount` / `idleCount` / `waitingCount`; `Container.health()` reports them and a
sampled `database.pool.saturated` line fires when `waitingCount` stays above zero. The worker sums
its consumer concurrencies against `DATABASE_POOL_MAX` at boot and emits
`worker.pool.oversubscribed` when the sum is larger. pgBouncer joins the core compose stack on
`:6432` with `pool_mode = transaction`; because `pg` sends `statement_timeout` as a startup
parameter that a transaction pooler must ignore, a migration sets the three timeouts on the role
with `ALTER ROLE CURRENT_USER SET`, and the worker's override becomes a `SET LOCAL` inside
`PgUnitOfWork.run`. `DATABASE_DIRECT_URL` carries migrations, the seed, `drizzle-kit` and the
archive's `DETACH … CONCURRENTLY` straight to Postgres. One smoke spec exercises what a
transaction pooler is known to break: `SHOW statement_timeout` inside a transaction, savepoint
nesting through `PgUnitOfWork`, `pg_advisory_xact_lock`, `FOR UPDATE SKIP LOCKED`, and a
`DETACH PARTITION CONCURRENTLY` on the direct URL.

#### 1.A The pool as configuration (`infrastructure`, `composition`, `web`, `worker`)

- [ ] `S1.1` **`DatabaseConfig` complete** — `packages/infrastructure/src/pg/primitive/database.ts`
  gains `idleTimeoutMs`, `connectionTimeoutMs` beside the existing `maxConnections` and
  `statementTimeoutMs`; the `Pool` reads all four, keeps `statement_timeout` as the startup
  parameter for direct connections, and adds `idle_in_transaction_session_timeout` (same
  mechanism, the classic "a connection held open by a forgotten `await`" guard) and
  `application_name` (`app` from the logging config, so `pg_stat_activity` says which process
  holds a connection). **Docs:** `docs/setup/13` §13.2.
- [ ] `S1.2` **`ContainerConfig.database` grows** — `packages/composition/src/container/container.config.ts`:
  `{ url, directUrl, poolMax, poolIdleTimeoutMs, poolConnectTimeoutMs, statementTimeoutMs }`, all
  but `url` optional with the defaults stated once, in `Database`, not here. **Docs:**
  `docs/setup/17`, `packages/composition/docs/reference/container.md`.
- [ ] `S1.3` **Both `env.ts` files read the six vars** — `apps/web/src/env.ts`,
  `apps/worker/src/env.ts`: `DATABASE_DIRECT_URL` (`z.url().optional()`, defaults to
  `DATABASE_URL` and is what `S1.11` warns about), `DATABASE_POOL_MAX` (`z.coerce.number().int()
  .min(1).default(10)`), `DATABASE_POOL_IDLE_TIMEOUT_MS` (30 000), `DATABASE_POOL_CONNECT_TIMEOUT_MS`
  (5 000 — today an unreachable Postgres hangs the request for the OS default),
  `DATABASE_STATEMENT_TIMEOUT_MS` (web 30 000, worker 120 000 — the one place the two files
  differ, with the comment saying why). `.env.example` gains the block with the same comments.
  **Docs:** `apps/web/docs/reference/env.md`, `apps/worker/docs/reference/env.md`.
- [ ] `S1.4` **`Database.stats()` and the health field** — `{ total, idle, waiting, max }` off the
  `Pool`; `Container.health()` (`container.ts` ~773) adds `pool: DatabaseStats` to the report,
  and `apps/web`'s health endpoint renders it. **Docs:** `packages/composition/docs/reference/container.md`.
- [ ] `S1.5` **`database.pool.saturated`** — `packages/observability/src/catalog/core.events.ts`:
  `warn`, fields `{ waiting, total, max, forMs }`. Emitted by a probe in `Container` on a timer
  (every 5 s, only while `waiting > 0`, and only after it has been so for two consecutive ticks,
  so a burst is not a page) — the container already owns a clock and a logger. **Docs:**
  `docs/setup/09b` code table, `docs/infra/reference/postgres.md` (this is the §5 row 4 trigger,
  now observable).
- [ ] `S1.6` **`worker.pool.oversubscribed`** — `apps/worker/src/bootstrap/worker-bootstrap.ts`
  sums the six concurrencies and compares against `DATABASE_POOL_MAX` once at start; a `warn`
  with `{ concurrency, poolMax }`. Not an error: a job that holds no connection is legitimate,
  but the operator reads the line before the queue stalls. **Docs:** `apps/worker/docs/reference/env.md`
  (the "count your processes" paragraph gains "and your concurrencies").

#### 1.B Timeouts that survive a pooler (`infrastructure`)

- [ ] `S1.7` **Role-level timeouts migration** — `packages/infrastructure/migrations/0021_*.sql`,
  hand-written: `ALTER ROLE CURRENT_USER SET statement_timeout = '30s'`,
  `… SET idle_in_transaction_session_timeout = '60s'`, `… SET lock_timeout = '10s'`. `CURRENT_USER`
  because the role name is the deployment's, not the repository's. Applies to new sessions only;
  the pooler's server connections pick it up on their next reset. `§20` sees no table, so it
  passes; the migration carries the comment saying it is the pooler floor. **Docs:**
  `docs/setup/13` §13.6 gains "the role-settings migration".
- [ ] `S1.8` **`SET LOCAL` in `PgUnitOfWork.run`** — when `statementTimeoutMs` differs from the
  role floor (the worker), `run` issues `set local statement_timeout = <ms>` as the first
  statement of the transaction, on the transaction handle, so it holds through pgBouncer and dies
  with the transaction. Outside a transaction the role floor applies, which is the intended
  asymmetry: batch work is transactional by the outbox rules already. `packages/infrastructure/tests/transaction/pg-unit-of-work.spec.ts`
  asserts `SHOW statement_timeout` inside `run` equals the configured value and outside it equals
  the role's. **Docs:** `packages/infrastructure/docs/reference/unit-of-work.md`.

#### 1.C pgBouncer in the stack (`infra`, `docs`)

- [ ] `S1.9` **The service** — `infra/docker-compose.yml`: `pgbouncer` (`edoburu/pgbouncer`,
  pinned tag) in the core stack, `depends_on: postgres: condition: service_healthy`, env
  `POOL_MODE=transaction`, `MAX_CLIENT_CONN=1000`, `DEFAULT_POOL_SIZE=20`, `MIN_POOL_SIZE=0`,
  `RESERVE_POOL_SIZE=5`, `SERVER_RESET_QUERY=DISCARD ALL`, `AUTH_TYPE=scram-sha-256`,
  `IGNORE_STARTUP_PARAMETERS=statement_timeout,lock_timeout,idle_in_transaction_session_timeout,extra_float_digits`,
  port `${PGBOUNCER_PORT:-6432}:6432`, healthcheck `pg_isready -h localhost -p 6432`. Postgres
  gains `command: postgres -c shared_preload_libraries=pg_stat_statements -c track_io_timing=on
  -c max_connections=200`, and `infra/postgres.init.sql` creates `pg_stat_statements` — the
  measurement that answers "which query" before any move on the §5 ladder. **Docs:**
  `docs/infra/reference/compose.md`, `docs/setup/11`.
- [ ] `S1.10` **`.env.example` and the scripts** — `DATABASE_URL` → `:6432`,
  `DATABASE_DIRECT_URL` → `:5432`, with the comment that the second is for DDL. `packages/infrastructure/package.json`
  `db:migrate` / `db:seed` / `db:generate` / `db:studio` and `drizzle.config.ts`,
  `migrate.ts`, `seed.ts` read `DATABASE_DIRECT_URL ?? DATABASE_URL`. `tooling/scripts/boot-smoke.mjs`
  waits on both ports. **Docs:** `docs/setup/11`, `docs/setup/13` §13.5.
- [ ] `S1.11` **The archive's DDL goes direct** — `PgActivityArchiveGateway`'s
  `detach … concurrently` cannot run inside a transaction and must not run through a
  transaction pooler; it takes a second `Database` built from `directUrl` (the container owns
  it, `dispose()` closes it), and `PgMaintenanceGateway`'s partition DDL uses the same handle.
  **Docs:** `packages/infrastructure/docs/reference/activity-archive.md`.
- [ ] `S1.12` **The pooled smoke spec** — `packages/infrastructure/tests/smoke/pooled.spec.ts`:
  through `DATABASE_URL`, `SHOW statement_timeout` inside a `PgUnitOfWork.run` equals the
  worker override and outside equals the role floor (`S1.7`); nested `run` is a savepoint that
  rolls back alone; two connections contend on `pg_advisory_xact_lock` and serialise;
  `PgOutboxGateway.drain` from two callers claims disjoint rows; through `DATABASE_DIRECT_URL`,
  `detach partition … concurrently` succeeds. Runs under `pnpm smoke`. **Docs:** `docs/setup/27`.
- [ ] `S1.13` **Docs** — new `docs/infra/reference/pgbouncer.md` (why transaction mode, the
  startup-parameter trap and the role floor that closes it, what `DISCARD ALL` costs, sizing:
  `DEFAULT_POOL_SIZE × databases` against `max_connections`, and the managed-pooler swap), added
  to `docs/infra/reference/meta.json` and `docs/infra/index.md`; `docs/infra/reference/postgres.md`
  sizing paragraph rewritten around the pooler; `docs/setup/24` §24 pool paragraph and
  `apps/web/docs/reference/server-functions.md` "count pools across replicas" updated;
  `docs/opinions/data-and-scale.md` §5 row 4 marked built with the trigger now observable
  (`S1.5`); `docs/ai/rules/data.md` Redis bullet unchanged, a pooling line added under
  "non-negotiable"; `docs/ai/rules/workflow.md` command block gains `db:partitions`,
  `infra:up:sharded` (from later phases, written once here).

**Exit.** `pnpm infra:up` starts pgBouncer healthy; `pnpm db:migrate` applies `0021` over the
direct URL; the web app and the worker connect through `:6432`; `pnpm smoke` includes
`pooled.spec.ts` green; `pg_stat_activity` shows `application_name` per process; setting
`DATABASE_POOL_MAX=2` and running the worker prints `worker.pool.oversubscribed` once; holding
three concurrent `pg_sleep(10)` against that pool prints `database.pool.saturated` and the health
endpoint shows `waiting: 1`; `check:architecture` is 20/20.

---

### Phase 2 — Partitioning: the policy on the table, the runway guarded

**Goal.** Each partitioned table declares its own column and retention in one place, the guard
that a hand-edited migration matches that declaration is a build failure rather than a paragraph in
`docs/setup/13`, the runway cannot be lost by a worker that was asleep on the first of the month,
partition pruning is proven by `EXPLAIN` rather than assumed, and the one exception (`messages`)
carries the trigger that reopens it.

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
a shell. Everything here is written against one `Database` and Phase 3 loops it per shard.

#### 2.A The allowlist carries the policy (`application`, `worker`)

- [ ] `S2.1` **`PartitionedTable` entries** —
  `packages/application/src/primitive/partitioned-table.ts`: `ALL` becomes
  `readonly { name, column: "occurred_at" | "created_at", retentionMonths: number | null }[]`,
  frozen; `PartitionedTableName` stays derived; `PartitionedTable.byName(name)` returns the entry.
  `apps/worker/src/consumer/maintenance.consumer.ts` deletes `PRUNE_AFTER_MONTHS` and reads
  `entry.retentionMonths`; the outbox-lag guard stays. **Docs:** `packages/application/docs/reference/ports.md`
  (the `MaintenanceGateway` paragraph), `apps/worker/docs/reference/consumers.md`.
- [ ] `S2.2` **`MaintenanceGateway.monthlyPartitionsAfter(table, from): Promise<number>`** —
  the port and `PgMaintenanceGateway`, reading `pg_inherits` the way
  `dropMonthlyPartitionsBefore` already does. **Docs:** `packages/application/docs/reference/ports.md`.
- [ ] `S2.3` **Runway at boot and the low-runway line** — `worker-bootstrap.ts` enqueues
  `partitions` once at start with a fixed `jobId: "partitions-boot"` (BullMQ dedupes a second
  replica's copy), and `MaintenanceConsumer.partitions()` emits `partition.runway.low`
  (`warn`, `{ table, monthsAhead }`) when `monthlyPartitionsAfter` returns fewer than two after
  ensuring. `partitions.schedule.ts`'s comment about the 2027 deadline is updated to say the
  deadline is now recovered at every boot. **Docs:** `apps/worker/docs/reference/schedules.md`,
  `docs/setup/25` §25.6, `docs/setup/09b` code table.

#### 2.B The guard and the proof (`tooling`, `infrastructure`)

- [ ] `S2.4` **§21 in `check-architecture.mjs`** — for each `migrations/*.sql`, every
  `CREATE TABLE "<t>" (…) PARTITION BY RANGE ("<c>")`: `<t>` in `PartitionedTable.ALL` (parsed
  from the primitive file the way §9 parses schema blocks) with `column === <c>`; the `PRIMARY
  KEY` in that statement names `<c>`; no `… DEFAULT` partition of `<t>` anywhere in
  `migrations/`. The inverse too: every allowlist entry has a `PARTITION BY` somewhere in
  `migrations/`. Summary line and `docs/setup/26` entry with the incident it prevents (a table
  partitioned in DDL but absent from the list is one the schedule never covers, and its runway
  ends in silence). **Docs:** `docs/setup/26`, `docs/ai/rules/workflow.md` (the count and the
  list), `AGENTS.md` ("twenty" → "twenty-three", once, at the end of Phase 3).
- [ ] `S2.5` **Pruning is proven** — `packages/infrastructure/tests/pg/partition-pruning.spec.ts`
  (integration, needs Postgres): for each of the three tables, insert into two months, run the
  slice's keyset query with a one-month window under `EXPLAIN (FORMAT JSON)`, assert exactly one
  `Append` child. This is the assertion that a future `WHERE` clause that drops the partition
  column is caught by a test, not by a slow production query. **Docs:**
  `packages/infrastructure/docs/reference/partitions.md` (new, `S2.8`).
- [ ] `S2.6` **`messages` — the recorded exception** — no code. `messaging.schema.ts`'s comment
  gains the trigger: reopen when one month of `messages` passes 50 M rows or
  `messages_keyset_idx` passes 10 GB, and the shape to build then is `PARTITION BY RANGE
  (created_at)` with the send dedupe moved to a Redis `SET NX` keyed
  `message:client:<org>:<conversation>:<clientId>` with a 24 h TTL, which is where a retry
  window belongs anyway. **Docs:** `packages/application/docs/reference/messaging.md`.
- [ ] `S2.7` **`pnpm db:partitions`** — `packages/infrastructure/partitions.ts` above `src/`
  (the rule for runnable scripts, `docs/ai/rules/folders.md`): ensures three months for every
  allowlist entry over `DATABASE_DIRECT_URL` and prints the runway per table; root
  `package.json` script. For the operator whose worker is down on the first. **Docs:**
  `docs/ai/rules/workflow.md` command block (written in `S1.13`), `docs/setup/13`.
- [ ] `S2.8` **Docs** — new `packages/infrastructure/docs/reference/partitions.md` (the
  allowlist as the source of truth, the two mechanics — partition key in the PK, drizzle cannot
  express `PARTITION BY` — the boot-time runway, why no `DEFAULT`, the pruning spec, and the
  `messages` exception), registered in `reference/meta.json` and `docs/index.md`;
  `docs/opinions/data-and-scale.md` §4.2 rewritten around the allowlist entry shape;
  `docs/ai/rules/data.md` partition bullet updated; `docs/setup/13` §13.6 hand-edit paragraph
  points at §21.

**Exit.** `pnpm check:architecture` is 21/21 with §21 passing on the twenty-one existing
migrations; removing `notifications` from `PartitionedTable.ALL` fails §21; starting the worker
against a database whose future partitions were dropped by hand recreates them and prints nothing;
dropping them down to one future month prints `partition.runway.low`; `partition-pruning.spec.ts`
is green; `pnpm db:partitions` prints three tables with their runway.

---

### Phase 3 — Virtual sharding: the seam, verified on one node

**Goal.** Every routed query is placed by a key the strategy derives, resolved through a directory
to one of 256 virtual shards and through the env map to one physical `Database`; the catalog and
the routed transactions are distinct and a repository that crosses them throws on one node; the
migrator, the seed, the health probe and every cross-tenant worker path loop the physical shards;
and a second physical shard is one compose profile and three env lines away — with the proof of
that split filed, not claimed.

**Design in one paragraph.** `ShardingStrategy.keyOf(principal)` runs once per request in a
`shardMiddleware` after `principalMiddleware`, and once per job in the worker's consumers, and
puts the `ShardKey` in `ShardScope` (an `AsyncLocalStorage<ShardKey>` beside `TransactionScope`).
`DatabaseCluster` holds one `Database` per physical shard from `ShardMap` (parsed from
`DATABASE_SHARD_<n>_*`, full coverage of 0–255, no overlap, unassigned → 0) and answers
`catalog()`, `forKey(key)` (via `ShardResolver`, which reads `shard_assignments` on the catalog
through a `CacheStore` read-through with a 300 s TTL and an explicit `invalidate(key)`), and
`each()`. `TransactionScope` stores `{ client, placement }`; `BaseRepository` declares its
placement and `this.db` resolves to the open transaction when placements agree, the right pool
when no transaction is open, and an `InternalError` when they disagree. Two `PgUnitOfWork`
instances — catalog and routed — are bound per slice in `Container`. `PgOrganizationFounder`
writes the `shard_assignments` row inside the catalog transaction that creates the organization;
a backfill migration writes one per existing organization. The shipped strategy and placement
policy live in `packages/composition/src/shard/`, which is the fork's swap point. Verification is
on one Postgres: the whole suite through the cluster, the tripwire spec, and the map/hash/scope
unit specs; the two-node rehearsal spec is written, gated on `DATABASE_SHARD_1_URL`, and expected
to fail on the catalog foreign keys until `S4.1`.

#### 3.0 Primitives and ports (`application`)

- [ ] `S3.1` **Primitives** — `packages/application/src/primitive/shard.ts`: `ShardKey` (branded
  string, `ShardKey.of(raw)` rejects empty), `VirtualShard` (`COUNT = 256`, `of(n)` validates
  the range, branded number), `Placement` (`"catalog" | "local" | "routed"`), and
  `CatalogTable` — a frozen closed list of the fifteen catalog table names from decision 5 plus
  `LOCAL` for the two local ones; `placementOf(table)` derives the third case. The comment on
  `COUNT` says it is never edited and why. **Docs:** `packages/application/docs/index.md` tree,
  `docs/opinions/vocabulary.md` (a "Shard vocabulary" row set).
- [ ] `S3.2` **Ports** — `packages/application/src/port/sharding.strategy.ts`
  (`keyOf(principal: Principal): ShardKey`), `shard-placement.policy.ts`
  (`place(key: ShardKey): VirtualShard`), `shard.resolver.ts`
  (`resolve(key): Promise<VirtualShard>`, `invalidate(key)`), `shard-assignment.repository.ts`
  (`findByKey`, `save({ key, virtualShard })`, `all(page)` for the move job). No principal on
  any of the last three: they are platform seams, like `MaintenanceGateway`. **Tripwire:**
  `test-container.spec.ts` pins the sorted port list and counts `src/port/*.ts`, so this commit
  also updates `TestContainer` (`S3.13`). **Docs:** `packages/application/docs/reference/ports.md`
  gains "The four shard ports".

#### 3.A Schema (`infrastructure`)

- [ ] `S3.3` **`shard_assignments`** — `packages/infrastructure/src/pg/schema/shard.schema.ts`:
  `shard_key text primary key`, `virtual_shard smallint not null`, `assigned_at`,
  `moved_at` nullable; `shard_assignments_virtual_idx (virtual_shard)` for the move job. A
  catalog table, so no `organization_id` — §9's exemption set becomes derived from
  `CatalogTable` (`S3.18`), and this is the first table to rely on it. Migration
  `0022_*.sql`, generated, then hand-appended with the backfill:
  `insert into shard_assignments (shard_key, virtual_shard) select id::text, <fnv1a-mod-256 in SQL> from organizations on conflict do nothing`
  — the same function `S3.11` ships in TypeScript, with a spec asserting both agree on the
  pinned vectors. **Docs:** `docs/setup/13` §13.3 modelling notes, `docs/opinions/vocabulary.md`
  table list.

#### 3.B Routing (`infrastructure`)

- [ ] `S3.4` **`ShardMap`** — `packages/infrastructure/src/pg/primitive/shard-map.ts`: built from
  `{ url, directUrl, shards: [{ index, url, directUrl, virtual: string }] }`; parses `virtual`
  (`a-b`, `n`, comma-joined), rejects overlap and out-of-range, fills gaps with 0, exposes
  `physicalOf(virtual): number` as a frozen 256-entry array. Unit spec covers coverage, overlap,
  gaps, the single-shard default. **Docs:** `packages/infrastructure/docs/reference/sharding.md`
  (new, `S3.21`).
- [ ] `S3.5` **`DatabaseCluster`** — `pg/primitive/database-cluster.ts`: one `Database` (and one
  direct `Database`, `S1.11`) per physical index; `catalog()`, `forKey(key)` (awaits
  `ShardResolver.resolve` then `physicalOf`), `forVirtual(v)`, `each()`, `isHealthy()` per shard
  as `Record<index, boolean>`, `close()`. It is the only file in `src/` that writes
  `new Database(` (`S3.18` §23). **Docs:** `sharding.md`.
- [ ] `S3.6` **`ShardScope` and placement in `TransactionScope`** — `pg/transaction/shard-scope.ts`
  (`current(): ShardKey | undefined`, `within(key, work)`); `transaction-scope.ts` stores
  `{ client, placement, key? }` and exposes `current()`, `placement()`. **Docs:**
  `packages/infrastructure/docs/reference/unit-of-work.md` (the "which pool" paragraph).
- [ ] `S3.7` **`BaseRepository` places itself and trips** — constructor takes
  `(cluster, transactions, shards, placement: Placement)`; `this.db` becomes an `async` accessor
  `this.handle()`: open transaction with the same placement → it; open transaction with a
  different placement → `InternalError("<table placement> inside a <tx placement> transaction")`;
  no transaction → `cluster.catalog().client` for `catalog`, `cluster.forKey(ShardScope.current()
  ?? throw)` for `routed`, and for `local` the catalog pool with a comment saying a local write
  outside any transaction is already against the outbox rules. Every `pg-*.ts` in
  `pg/repository/` declares its placement in `super(...)`; the twenty-plus call sites of
  `this.db` become `await this.handle()`. Mechanical, one commit, and the reason `S3.18`'s §22
  exists is that nothing else stops a routed table from being read through a catalog repository.
  **Docs:** `docs/setup/13` §13.7, `docs/ai/skills/add-slice.md` step 6 ("declare the
  placement; a slice is `routed` unless it is one of the fifteen").
- [ ] `S3.8` **Two `PgUnitOfWork`s** — `pg-unit-of-work.ts` takes `(cluster, transactions, shards,
  placement)`; `run(work)` opens on `catalog()` or on `forKey(ShardScope.current())`, throwing
  `InternalError` when `routed` and no key is in scope, and passes `placement` into
  `TransactionScope.within`. Nested `run` on the same placement is the savepoint it is today;
  nested on a different placement throws — a catalog use-case calling a routed one inside its
  transaction is precisely the coupling a split cannot honour. `S1.8`'s `SET LOCAL` survives.
  Spec: the tripwire in both directions, the savepoint path, the missing-key path. **Docs:**
  `unit-of-work.md`.
- [ ] `S3.9` **`PgShardResolver`** — `pg/repository/pg-shard.resolver.ts`, `CapabilityCache`'s
  shape: `CacheStore` read-through on `shard:key:<key>` with a 300 s TTL (a placement changes
  once a year, not once a minute; the move job invalidates explicitly), catalog pool underneath,
  `shard.resolution.failed` (`error`, `{ key }`) then `InternalError` on a missing row. It is
  built on `cluster.catalog()` directly, not on `BaseRepository`: it is what `forKey` calls, and
  a resolver that routed would recurse. **Docs:** `sharding.md`.
- [ ] `S3.10` **`PgShardAssignmentRepository`** — `pg/repository/pg-shard-assignment.repository.ts`,
  `catalog` placement: `findByKey`, `save` (upsert, `moved_at` set when `virtual_shard` changes,
  then `resolver.invalidate(key)`), `all(page)` keyset over `shard_key`. Emits nothing; the
  founder emits `shard.assignment.created` (`info`, `{ key, virtualShard }`). **Docs:** `sharding.md`.

#### 3.C The strategy and the policy the kit ships (`composition`)

- [ ] `S3.11` **`packages/composition/src/shard/`** — new folder, one row in
  `docs/opinions/folders.md` ("the routing policy the DI root binds; a fork replaces this folder")
  and `docs/ai/rules/folders.md`. `organization-sharding.strategy.ts` →
  `OrganizationShardingStrategy.keyOf(principal) = ShardKey.of(principal.organizationId)`, with
  the `NIL` organization of `SystemPrincipal.platform()` rejected (platform work uses `each()`,
  never a key). `hash-shard-placement.policy.ts` → `HashShardPlacementPolicy`: FNV-1a 32-bit over
  the UTF-8 bytes of the key, `mod 256`; a spec pins ten `(key, virtualShard)` vectors so a
  change to the function is a failing build, and asserts 10 000 v7 uuids land within ±25 % of
  uniform per shard (the time-ordered prefix is why FNV over the whole string, not the first
  bytes). **Docs:** `packages/composition/docs/index.md` tree, `sharding.md` ("how a fork shards
  by something else": one strategy class, one key column on its tables, nothing else).
- [ ] `S3.12` **`Container`** — `container.config.ts` `database` becomes
  `{ url, directUrl, poolMax…, shards: readonly { index, url, directUrl, virtual }[] }`; both
  `env.ts` collect `DATABASE_SHARD_<n>_*` with a `z.preprocess` over `process.env` keys (still
  the one reader). `Container` builds `ShardMap` → `DatabaseCluster`, `ShardScope`,
  `PgShardResolver`, `PgShardAssignmentRepository`, both `PgUnitOfWork`s, binds
  `OrganizationShardingStrategy` and `HashShardPlacementPolicy`, passes the catalog unit of work
  to `RoleUseCases`, `MemberUseCases`, `ApiKeyUseCases`, the enrollers, claimer and founder, and
  the routed one to `NotificationUseCases`, `MessagingUseCases`, `DocumentUseCases`;
  `PgOrganizationFounder.found` writes the assignment via the policy inside its transaction;
  `health()` reports `database: Record<index, boolean>` and `dispose()` closes the cluster last.
  `Container` exposes `shards: ShardScope`, `sharding: ShardingStrategy` and `cluster` for the
  edges (`S3.14`, `S3.15`). **Docs:** `docs/setup/17`, `packages/composition/docs/reference/container.md`.
- [ ] `S3.13` **`TestContainer` and fakes** — `packages/composition/src/fake/`: `FakeShardResolver`
  (a `Map`), `FakeShardAssignmentRepository`, `FixedShardingStrategy`, `FixedShardPlacementPolicy`;
  `TestPorts` gains the four; `test-container.spec.ts` pinned list updated. **Docs:**
  `packages/composition/docs/index.md`.

#### 3.D The key enters scope at the edges (`web`, `worker`)

- [ ] `S3.14` **Web** — `apps/web/src/server/orpc/base.ts`: `shardMiddleware` after
  `principalMiddleware`, `container.shards.within(container.sharding.keyOf(principal), next)`;
  `authed` chains it. The three `server/*.fn.ts` and the realtime/message async-generator routers
  (which outlive `next()` — the scope must wrap the generator's iteration, not its creation) get
  the same wrap through one `withShard(container, principal, fn)` in `apps/web/src/server/`.
  Better Auth's own handlers are catalog-only and need no key; the sign-in hook's
  `activeOrganizationFor` is a catalog read. **Docs:** `apps/web/docs/reference/enforcement-surfaces.md`
  (a fourth surface: the shard scope), `docs/setup/24`.
- [ ] `S3.15` **Worker** — every consumer that builds `SystemPrincipal.forOrganization(orgId)`
  wraps its use-case call in `container.shards.within(container.sharding.keyOf(principal), …)`;
  a `withShard` in `apps/worker/src/bootstrap/` mirrors the web one. Platform consumers
  (`MaintenanceConsumer`, `OutboxConsumer`, `AnalyticsConsumer`'s replay, the archive) never set
  a key. **Docs:** `apps/worker/docs/reference/consumers.md`.
- [ ] `S3.16` **The five cross-tenant paths loop the cluster** — `OutboxConsumer.drain` runs
  `container.outbox.drain` once per physical shard (`PgOutboxGateway` takes the `Database` it
  drains; `SKIP LOCKED` is per shard and two replicas still share each); `MaintenanceConsumer`
  ensures and prunes partitions on every shard (`PgMaintenanceGateway` likewise);
  `PgActivityArchiveGateway` archives per shard with the shard index in the S3 key;
  `PgActivityReplayReader` reads per shard and the ClickHouse projection gains a `shard UInt8`
  column so "ask the destination for its last row" is per shard (`docs/setup/15`);
  `PgNotificationPreferenceRepository.organizationsWithDigest` runs per shard and the digest
  fan-out sets the key per organization. Each keeps its query count; the loop is over shards, not
  tenants. **Docs:** `apps/worker/docs/reference/schedules.md`, `consumers.md`,
  `packages/infrastructure/docs/reference/clickhouse.md`, `activity-archive.md`.

#### 3.E Migrations, seed, scripts (`infrastructure`)

- [ ] `S3.17` **Every script loops the physical shards** — `migrate.ts` migrates each
  `directUrl` in index order (catalog first, so a backfill that reads it runs against a migrated
  catalog); `seed.ts` seeds the bootstrap organization on the catalog and its assignment;
  `partitions.ts` (`S2.7`) loops; `drizzle.config.ts` and `db:studio` stay on the catalog with the
  comment. The env parsing they share moves into one `packages/infrastructure/shard-env.ts` above
  `src/` (a script, not a module — the same rule that keeps `migrate.ts` there). **Docs:**
  `docs/setup/13` §13.5–13.6, `docs/ai/rules/workflow.md`.

#### 3.F Assertions (`tooling`)

- [ ] `S3.18` **§22 and §23; §9 derived** — `check-architecture.mjs`: §9's `TENANT_EXEMPT` is
  parsed from `CatalogTable` in `application/src/primitive/shard.ts` (plus
  `__drizzle_migrations`), so a table cannot be catalog in one file and tenant-exempt in another.
  §22: for every `pg/repository/pg-*.ts`, the tables it imports from `../schema/index.js` all
  share one placement (`local` mixes with either), or the file is in `CROSS_PLACEMENT_KNOWN` —
  which starts at the audited set (`pg-membership.reader.ts` joins `users`; the recipient reader;
  list every hit) and which `S4.1` empties. §23: `new Database(` appears in `src/` only in
  `database-cluster.ts`, and `database.client` / `.client` off a `Database` only there and in the
  scripts above `src/`. `docs/setup/26` gains the three entries with the failure each prevents.
  **Docs:** `docs/setup/26`, `docs/ai/rules/workflow.md` (twenty-three), `AGENTS.md`.

#### 3.G The rehearsal kit (`infra`, `infrastructure`)

- [ ] `S3.19` **Compose profile `sharded`** — `infra/docker-compose.yml`: `postgres-shard-1` (same
  image, same `init.sql`, port `${POSTGRES_SHARD_1_PORT:-5433}`, own volume) and
  `pgbouncer-shard-1` on `:6433`; root script `infra:up:sharded`; `.env.example` gains a commented
  block `DATABASE_SHARD_1_URL=postgres://…:6433/ratchet`, `DATABASE_SHARD_1_DIRECT_URL`,
  `DATABASE_SHARD_1_VIRTUAL=128-255`. **Docs:** `docs/infra/reference/compose.md`, `docs/setup/11`.
- [ ] `S3.20` **The rehearsal spec** — `packages/infrastructure/tests/smoke/sharded.spec.ts`,
  `describe.skipIf(!process.env.DATABASE_SHARD_1_URL)`: migrates both shards, creates two
  organizations whose assignments put them on virtual 3 and virtual 200, sends one message in
  each through `MessagingUseCases`, asserts each `messages` row exists on exactly its physical
  shard and that `shard_assignments` on the catalog has both rows. **Expected to fail on
  `notifications.user_id → users` and `… organization_id → organizations` on shard 1 until
  `S4.1` decides the foreign keys** — the item is done when the spec is written and fails on
  exactly that constraint, which is the split's first real cost made visible. **Docs:**
  `sharding.md` ("rehearsing the split").

#### 3.H Docs and verify

- [ ] `S3.21` **Docs** — new `packages/infrastructure/docs/reference/sharding.md` (the key, the
  directory, the map, the three placements and the tripwire, the two unit-of-works, the edges,
  the loops, how a fork changes the strategy, rehearsing the split, what §4 still owes),
  registered in `reference/meta.json` and `docs/index.md`. `docs/opinions/data-and-scale.md`:
  new §4.5 "Route by key from the first line" (the seam-early argument, quoting
  `simplicity.md`'s exception), §5 row 7 split into "7a — the seam (built; this plan)" and
  "7b — the physical split (weeks → days; `DB-SCALING-PLAN.md` Phase 4)", §7 "sharding is a
  repository concern" reworded to "a repository and DI-root concern", §8 diagrams gain the
  catalog, §9 "do not do this week" keeps *running* a second shard. `docs/ai/rules/data.md`
  gains the placement rule and the "reads that cross run before the transaction" rule;
  `docs/ai/rules/layering.md` unchanged (nothing crosses a layer); `docs/opinions/classes.md`
  role nouns unchanged (`Strategy`, `Policy`, `Resolver`, `Repository` all exist);
  `docs/setup/13`, `17`, `24`, `25`, `26`, `29`; `apps/web/docs/reference/env.md`,
  `apps/worker/docs/reference/env.md` (the shard block); `docs/infra/reference/postgres.md`.
- [ ] `S3.22` **Verify** — `pnpm build:packages && pnpm --filter @loadbearing/web build`;
  `pnpm check:architecture` 23/23 no skip; `pnpm typecheck && pnpm lint && pnpm test`;
  `pnpm infra:up && pnpm db:migrate && pnpm db:seed`; `pnpm --filter @loadbearing/infrastructure
  test` (every Postgres suite now runs through `DatabaseCluster` with one shard); `pnpm smoke`;
  then `pnpm infra:up:sharded` with the three env lines and `pnpm smoke` again to watch
  `sharded.spec.ts` fail on the foreign key and nothing else.

**Exit.** With one physical shard: every suite green, `check:architecture` 23/23; a repository
given the wrong placement fails its first spec with the tripwire's message; an oRPC call with no
key in scope to a routed procedure is impossible by construction (`authed` chains the middleware)
and a direct `routedUnitOfWork.run` without one throws; `shard_assignments` holds one row per
organization after `db:migrate` and gains one on every organization created; `curl /health` shows
`database: { "0": true }`. With `infra:up:sharded` and the three env lines: `db:migrate` migrates
both, `/health` shows two shards, and `sharded.spec.ts` fails on exactly the foreign-key
constraint `S4.1` names.

---

### Phase 4 — The physical split (filed, not built)

- [ ] `S4.1` **The foreign-key decision.** Two shapes, decided when a second shard is actually
  provisioned: **(a)** drop every FK from a routed table to a catalog table, replace tenant
  delete with a maintenance job that sweeps routed rows by `organization_id` per shard, and add a
  nightly reconciliation that counts orphans; or **(b)** logically replicate the catalog tables
  to every shard (`CREATE PUBLICATION` on shard 0, `CREATE SUBSCRIPTION` on each) so the FKs
  hold against local copies, accepting that a membership written milliseconds after a user is
  created can race the apply. (a) is what most sharded systems do; (b) is what keeps
  `ON DELETE CASCADE` meaning something. Whichever lands empties `CROSS_PLACEMENT_KNOWN`.
- [ ] `S4.2` **Tenant move** as a `MaintenanceConsumer` job: `shard_assignments.moving_to`,
  copy every routed table's rows for the key in keyset batches, verify counts per table, flip
  `virtual_shard`, `resolver.invalidate`, delete from the source after a grace period. The write
  freeze during the flip is a `ForbiddenError` from `shardMiddleware` for that key.
- [ ] `S4.3` **Virtual-shard move** — the same job over every key in a virtual shard, then the
  `DATABASE_SHARD_<n>_VIRTUAL` edit; the map refuses a range that still has rows on the old side.
- [ ] `S4.4` **Read replica per shard** — `DATABASE_SHARD_<n>_REPLICA_URL`, `cluster.reader(key)`,
  the dashboard and analytics reads moved onto it; §5 row 3.
- [ ] `S4.5` **The catalog is the last single primary** — measure first: capability and shard
  resolution are both cached; the catalog's write rate is sign-ups and role edits. If it hurts,
  a replica for its reads before anything else.
- [ ] `S4.6` **Two-node proof** — `sharded.spec.ts` green is this phase's Exit, plus a tenant
  move under load with no lost writes.
- [ ] `S4.7` **`messages` partitioning** when `S2.6`'s trigger fires.
- [ ] `S4.8` **Load test** the routed paths at 10× against the sharded compose profile before any
  of this is called production-ready.

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 23/23 after Phase 3, no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm infra:up && pnpm db:migrate && pnpm db:seed && pnpm db:partitions
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
pnpm infra:up:sharded        # then DATABASE_SHARD_1_* in .env, db:migrate, smoke again
```

Then by hand, per phase Exit line: the pooler is in the connection path (`pg_stat_activity`
shows `application_name` and connections arriving from the pgBouncer container); the runway
survives a stopped worker; a wrong placement trips on one node; the rehearsal spec fails on the
constraint `S4.1` names and on nothing else.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-13 | @sami | Created from a read of the tree at `c72ca9e`: four phases covering connection pooling and pgBouncer, partition policy and guards, the virtual-sharding seam with a pluggable strategy, a directory and an env map, and the filed physical split |

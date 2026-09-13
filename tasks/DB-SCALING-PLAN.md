---
title: Database scaling plan — connection pooling, partitioning, virtual sharding
updated: 2026-09-13
owner: sami
schema: plan/v1
source: tree at c72ca9e (claude/sleepy-franklin-yqa9av), 2026-09-13
verified: tree at 49703c9, against a live stack, 2026-09-13; second pass same day, stricter
---

# Database scaling plan

> **How to use this file**
>
> 1. Every item has a unique ID (`S1.3`). Never reuse or renumber one.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing, and
>    `unverified:` naming the command when the proof needs a container the executor lacks.
>    A `verified:` line means the item's *premise* was tested against a live stack and holds;
>    a `corrected:` line means it did not and the text above was changed. Neither moves a
>    checkbox: nothing here has been built.
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
   `conversation_members`, `messages`, `document_chunks`, and every future slice. Those three
   lists cover all twenty-two tables in `pg/schema/` exactly once, with nothing left over.
   `local` has three writers beyond the two that insert into it, and each is already looped per
   shard by `S3.16`: `PgOutboxGateway.drain` (`update outbox_event set published_at`),
   `PgActivityArchiveGateway` (detach, attach, drop on `activity_log`) and
   `PgMaintenanceGateway` (partition DDL on both). RBAC on the
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
    transaction-mode pooler must be told to ignore — and then it is gone. Measured, not assumed:
    without the ignore list `new Database({ url })` never connects at all
    (`unsupported startup parameter: statement_timeout`), and with it `SHOW statement_timeout`
    reads `0`, not a smaller number. Unlimited, on every application connection, is the state
    this decision exists to prevent. `ALTER ROLE CURRENT_USER
    SET …` in a migration is the floor that survives the pooler; the worker's longer batch timeout
    is `SET LOCAL` inside `PgUnitOfWork.run`, which is transaction-scoped and therefore
    pooler-safe. The startup parameter stays for direct connections.
11. **`messages` stays unpartitioned.** The decision at `messaging.schema.ts` holds; `S2.5` records
    the trigger that reopens it rather than leaving it to a feeling.
12. **No new package, no new dependency, no new file suffix.** One new Tier 0 (pgBouncer), one new
    folder name (`shard/` in `composition`), three new `check-architecture` assertions (§21–§23),
    which makes the count twenty-three everywhere the docs say twenty — four sites, and one of
    them does not say twenty: `AGENTS.md:23`, `docs/ai/rules/workflow.md:34`,
    `docs/setup/26-hygiene-and-ci.md:369`, and `docs/ai/rules/workflow.md:14`, whose command
    block still says `18 assertions` and is stale by two before this plan touches it.

### What exists and is reused (verified against the tree at `c72ca9e`)

Re-read at `49703c9`, where every line below still holds. One thing moved: a twenty-second
migration, `0021_cold_guardian.sql`, has landed since `c72ca9e`, so the numbers this plan
reserves shift by one — `S1.7` is `0022`, `S3.3` is `0023` — and `check-architecture` §21 runs
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

- [x] `S1.1` **`DatabaseConfig` complete** — `packages/infrastructure/src/pg/primitive/database.ts`
  gains `idleTimeoutMs`, `connectionTimeoutMs` beside the existing `maxConnections` and
  `statementTimeoutMs`; the `Pool` reads all four, keeps `statement_timeout` as the startup
  parameter for direct connections, and adds `idle_in_transaction_session_timeout` (same
  mechanism, the classic "a connection held open by a forgotten `await`" guard) and
  `application_name` (`app` from the logging config, so `pg_stat_activity` says which process
  holds a connection). **Docs:** `docs/setup/13` §13.2.
  `verified: 2026-09-13` — `application_name` is the one startup parameter that **survives** a
  transaction pooler: pgBouncer tracks it natively, so a `Pool` sending all four read
  `application_name = loadbearing-probe` through `:6432` while the three timeouts read `0`.
  The `pg_stat_activity` goal needs no ignore-list entry and no role setting.
  `corrected: 2026-09-13` — **the item is missing the line that keeps the worker alive.**
  `database.ts` registers no `pool.on("error")`, and pg-pool emits `error` when an *idle* client's
  socket dies; `apps/worker/src/main.ts:24-27` turns an uncaught exception into `exit(1)`.
  Measured twice: a `docker restart` of the pooler under an idle worker logged
  `phase: uncaughtException` and the process exited `1`; and a server-side
  `idle_in_transaction_session_timeout` firing inside `PgUnitOfWork.run` surfaced as
  `Unhandled 'error' event: terminating connection due to idle-in-transaction timeout`
  (`FATAL 25P03`) and killed the probe process before `run()`'s own `catch` ever ran. `S1.1`
  adds `pool.on("error", …)` routed to a new `database.pool.error` (`warn`, `{ message }`) in
  the observability catalog, and `S1.7`'s deploy step is written against this: the pooler is
  never restarted under a live worker, it is `RECONNECT`ed — measured, the worker survives that.
  `done: 2026-09-13` — all four config fields, `application_name`, and the `pool.on("error")`
  listener routed to `database.pool.error`. Two things the build changed beyond the item's text.
  The logger is now constructed **first** in `Container`, before the pool, because the pool is
  handed a listener that closes over it — which is what the logger's own comment always claimed
  and was not true. And `Database` keeps its defaults as private statics rather than letting
  `ContainerConfig` restate them, so `new Database({ url })` in `migrate.ts` gets the same pool
  the apps get.
- [x] `S1.2` **`ContainerConfig.database` grows** — `packages/composition/src/container/container.config.ts`:
  `{ url, directUrl, poolMax, poolIdleTimeoutMs, poolConnectTimeoutMs, statementTimeoutMs }`, all
  but `url` optional with the defaults stated once, in `Database`, not here. **Docs:**
  `docs/setup/17`, `packages/composition/docs/reference/container.md`.
  `done: 2026-09-13`
- [x] `S1.3` **Both `env.ts` files read the six vars** — `apps/web/src/env.ts`,
  `apps/worker/src/env.ts`: `DATABASE_DIRECT_URL` (`z.url().optional()`, defaults to
  `DATABASE_URL` and is what `S1.11` warns about), `DATABASE_POOL_MAX` (`z.coerce.number().int()
  .min(1).default(10)`), `DATABASE_POOL_IDLE_TIMEOUT_MS` (30 000), `DATABASE_POOL_CONNECT_TIMEOUT_MS`
  (5 000 — today an unreachable Postgres hangs the request for the OS default),
  `DATABASE_STATEMENT_TIMEOUT_MS` (web 30 000, worker 120 000 — the one place the two files
  differ, with the comment saying why). `.env.example` gains the block with the same comments.
  **Docs:** `apps/web/docs/reference/env.md`, `apps/worker/docs/reference/env.md`.
  `done: 2026-09-13` — `.env.example` carries the block, and `DATABASE_URL` there now names
  `:6432` with `DATABASE_DIRECT_URL` on `:5432` beside it.
- [x] `S1.4` **`Database.stats()` and the health field** — `{ total, idle, waiting, max }` off the
  `Pool`; `Container.health()` (`container.ts` ~773) adds `pool: DatabaseStats` to the report,
  and `apps/web`'s health endpoint renders it. **Docs:** `packages/composition/docs/reference/container.md`.
  `corrected: 2026-09-13` — `waitingCount` cannot see the pooler. Against a pgBouncer with
  `DEFAULT_POOL_SIZE=2`, three concurrent `pg_sleep` transactions from one `Pool({ max: 10 })`
  read `total=3 idle=0 waiting=0` app-side while `SHOW POOLS` on the console read
  `cl_waiting=1 maxwait=1s`. Saturation behind the pooler is invisible to this field and to
  `S1.5`'s probe, and after `query_wait_timeout` (120 s by default) it arrives as an error the
  application has never seen. The health report needs a second source: `SHOW POOLS` over the
  console port, or the pooler's own metrics endpoint. `S1.13` owes the paragraph.
  `done: 2026-09-13` — `pool: DatabaseStats` is on the report and `apps/web`'s health route
  needed no change, because it serialises the whole report. Deliberately **not** part of
  `healthy`: a saturated pool is load, and a readiness check that fails under load takes the
  replica out exactly when it is busy.
  One more thing measured while walking the Exit line, now in `pgbouncer.md`: `health()` competes
  with the traffic it reports on. `stats()` is free, but `isHealthy()` runs `SELECT 1` and queues
  for a pool slot like anything else, so under real saturation the probe is slow for the same
  reason the requests are.
- [x] `S1.5` **`database.pool.saturated`** — `packages/observability/src/catalog/core.events.ts`:
  `warn`, fields `{ waiting, total, max, forMs }`. Emitted by a probe in `Container` on a timer
  (every 5 s, only while `waiting > 0`, and only after it has been so for two consecutive ticks,
  so a burst is not a page) — the container already owns a clock and a logger. **Docs:**
  `docs/setup/09b` code table, `docs/infra/reference/postgres.md` (this is the §5 row 4 trigger,
  now observable).
  `corrected: 2026-09-13, built` — **"every 5 s … two consecutive ticks" can never fire.** Found by
  running it: `waiting` cannot outlive `DATABASE_POOL_CONNECT_TIMEOUT_MS`, because the waiting
  caller is rejected when it expires — and that default is 5 s, so the second tick arrives after
  the queue has already cleared by rejection. The first attempt at the Exit-line rehearsal died
  with `timeout exceeded when trying to connect` and emitted nothing at all.
  The window is now derived: `connectTimeoutMs / 4` per tick, floor 250 ms, so two ticks is half
  the connect timeout. At the defaults that is 1.25 s per tick and a line at 2.5 s. Measured
  against a two-connection pool with three concurrent transactions:
  `database.pool.saturated waiting=1 total=2 max=2 forMs=2500`, then `waiting=2 forMs=3750`.
  Any fixed interval here is wrong; the two numbers have to move together.
- [x] `S1.6` **`worker.pool.oversubscribed`** — `apps/worker/src/bootstrap/worker-bootstrap.ts`
  sums the six concurrencies and compares against `DATABASE_POOL_MAX` once at start; a `warn`
  with `{ concurrency, poolMax }`. Not an error: a job that holds no connection is legitimate,
  but the operator reads the line before the queue stalls. **Docs:** `apps/worker/docs/reference/env.md`
  (the "count your processes" paragraph gains "and your concurrencies").
  `verified: 2026-09-13` — six consumer files, defaults `4 + 1 + 4 + 8 + 2 + 1 = 20` against a
  pool of ten (`apps/worker/src/env.ts:43-57`), so the Context paragraph's arithmetic holds.
  Two refinements: the boot smoke reported `consumers: 5` because `AnalyticsConsumer` starts only
  with a projector, so the sum must be over the consumers that *started*, not the six in the
  tree; and `WORKER_EVENT_CONCURRENCY` (8) counts fully — `PgOutboxGateway.drain` awaits its
  relay **inside** `unitOfWork.run` (`pg-outbox.gateway.ts:52`), so every in-flight batch pins one
  pool connection and one pooler server slot for the whole of its Redis round trips.
  `done: 2026-09-13` — summed off `worker.opts.concurrency` of the workers in `this.workers`,
  which is the record of what started, so no bookkeeping field was needed. Measured on a real
  boot: `worker.pool.oversubscribed concurrency=19 poolMax=10` — **19, not 20**, because
  `AnalyticsConsumer` does not start without a ClickHouse config. The item's original "sums the
  six concurrencies" would have printed 20 and been wrong on every deployment that runs no
  analytics.

#### 1.B Timeouts that survive a pooler (`infrastructure`)

- [x] `S1.7` **Role-level timeouts migration** — `packages/infrastructure/migrations/0021_*.sql`,
  hand-written: `ALTER ROLE CURRENT_USER SET statement_timeout = '30s'`,
  `… SET idle_in_transaction_session_timeout = '60s'`, `… SET lock_timeout = '10s'`. `CURRENT_USER`
  because the role name is the deployment's, not the repository's. Applies to new sessions only;
  the pooler's server connections pick it up on their next **reconnect**. `§20` sees no table, so
  it passes; the migration carries the comment saying it is the pooler floor. **Docs:**
  `docs/setup/13` §13.6 gains "the role-settings migration".
  `verified: 2026-09-13` — the migrator applies `ALTER ROLE CURRENT_USER SET …` inside its own
  transaction without complaint, and `pg_db_role_setting` carries all three afterwards. A fresh
  pgBouncer server connection then reads `statement_timeout = 30s` through `:6432`.
  `corrected: 2026-09-13` — "on their next reset" was wrong and the word mattered. A server
  connection already open when the migration lands keeps `statement_timeout = 0` until that
  connection is **closed**; measured: 30s direct and still `0` through the pooler until the
  pooler was restarted. The item owes a deploy step: `RECONNECT` on the pgBouncer console —
  and only that verb, because a restart under a live worker kills it (`S1.1`). Without the step
  the window is `server_idle_timeout` (600 s by default) for an idle pool and up to
  `server_lifetime` (3600 s, randomised) for a busy one.
  `corrected: 2026-09-13, second pass` — the first pass explained the above as "`DISCARD ALL` is
  `RESET ALL`", and that mechanism was wrong even though the conclusion held: in transaction
  mode pgBouncer **never runs `server_reset_query`** unless `server_reset_query_always = 1`.
  Measured: one client issued a session-level `set statement_timeout = '7s'` and released; all
  twenty-five fresh clients that followed read `7s`. So the setting on an open server connection
  is not reset on release, it is not reset on reconnect of the *client*, and the only things that
  change it are a new server connection or an explicit `SET`. The rule this creates is stronger
  than the plan states and belongs in `S1.13`: **nothing in this codebase may issue a session-level
  `SET`, ever** — one does not poison one connection, it poisons the pool. The tree is clean
  today (zero hits in first-party source; neither Better Auth's adapter nor drizzle's
  node-postgres driver issues one), and `S3.18` should consider a grep-assertion for a `set `
  fragment without `local` so it stays so.
  A second premise the item never questioned: `CURRENT_USER` is whoever runs `db:migrate`. In a
  deployment where the migrator's role differs from the application's — the ordinary shape once
  there is a DBA — the floor lands on the wrong role and the application still runs with `0`.
  The item must either name the application role from `DATABASE_URL` or state "one role" as a
  constraint `docs/infra/reference/pgbouncer.md` carries. `unverified:` a two-role deployment.
  `done: 2026-09-13` — `0022_pooler_timeout_floor.sql`, hand-written, three `ALTER ROLE
  CURRENT_USER SET` statements and no table. Applied over `DATABASE_DIRECT_URL`;
  `pg_db_role_setting` carries all three, and a fresh pooled session reads `statement_timeout =
  30s`. The one-role constraint is stated in the migration's own comment and on the reference
  page rather than being enforced, which is the honest shape: nothing in the repository can see
  the deployment's role split.
- [x] `S1.8` **`SET LOCAL` in `PgUnitOfWork.run`** — when `statementTimeoutMs` differs from the
  role floor (the worker), `run` issues `set local statement_timeout = <ms>` as the first
  statement of the transaction, on the transaction handle, so it holds through pgBouncer and dies
  with the transaction. Outside a transaction the role floor applies, which is the intended
  asymmetry: batch work is transactional by the outbox rules already. `packages/infrastructure/tests/transaction/pg-unit-of-work.spec.ts`
  asserts `SHOW statement_timeout` inside `run` equals the configured value and outside it equals
  the role's. **Docs:** `packages/infrastructure/docs/reference/unit-of-work.md`.
  `verified: 2026-09-13` — through `:6432`, against the real `PgUnitOfWork`: `set local
  statement_timeout = 120000` reads back `2min` inside `run`, `30s` on the pool handle after it,
  and `30s` again in the next transaction, which is the one that would have inherited a leak off
  a recycled server connection. The mechanism is pooler-safe as written.
  `done: 2026-09-13` — `PgUnitOfWork` takes a `PgUnitOfWorkConfig`, and two things the spec caught
  on the way in. Postgres accepts **no bind parameter in a `SET`**, the same trap the partition
  DDL documents, so the statement is `sql.raw` over a truncated integer. And a nested `run()` now
  sets nothing: `SET LOCAL` inside a savepoint outlives a rollback to that savepoint, so the inner
  call would silently raise the outer transaction's ceiling.
  Two spec cases, with values that are neither the default — 25 s on the pool, 90 s inside `run`,
  25 s after. (90 000 ms renders as `90s`, not `1min 30s`; the first version of the assertion was
  wrong about that and the failure is what proved the mechanism works.)

#### 1.C pgBouncer in the stack (`infra`, `docs`)

- [x] `S1.9` **The service** — `infra/docker-compose.yml`: `pgbouncer` (`edoburu/pgbouncer`,
  pinned tag) in the core stack, `depends_on: postgres: condition: service_healthy`, env
  `POOL_MODE=transaction`, `MAX_CLIENT_CONN=1000`, `DEFAULT_POOL_SIZE=20`, `MIN_POOL_SIZE=0`,
  `RESERVE_POOL_SIZE=5`, `SERVER_RESET_QUERY=DISCARD ALL`, `AUTH_TYPE=scram-sha-256`,
  `IGNORE_STARTUP_PARAMETERS=statement_timeout,lock_timeout,idle_in_transaction_session_timeout,extra_float_digits`,
  port `${PGBOUNCER_PORT:-6432}:6432`, healthcheck `pg_isready -h localhost -p 6432`. Postgres
  gains `command: postgres -c shared_preload_libraries=pg_stat_statements -c track_io_timing=on
  -c max_connections=200`, and `infra/postgres.init.sql` creates `pg_stat_statements` — the
  measurement that answers "which query" before any move on the §5 ladder. **Docs:**
  `docs/infra/reference/compose.md`, `docs/setup/11`.
  `verified: 2026-09-13` — `edoburu/pgbouncer:v1.24.1-p1` reads both names this item depends on:
  `AUTH_TYPE` and `IGNORE_STARTUP_PARAMETERS` are lines 120 and 134 of its `entrypoint.sh`, and
  the image's own default for the second is `extra_float_digits` alone, which is why leaving it
  out is the failure `S1.10` describes rather than a milder setting. `AUTH_TYPE=scram-sha-256`
  authenticates against the compose Postgres with no userlist of our own. Separately, a scratch
  `pgvector/pgvector:pg17` started with exactly the three command flags above reports
  `shared_preload_libraries = pg_stat_statements`, `track_io_timing = on`, `max_connections = 200`,
  and `create extension pg_stat_statements` then tracks.
  `corrected: 2026-09-13` — one operator note the item was missing: `postgres.init.sql` is a
  `docker-entrypoint-initdb.d` script, so it runs **only on a first boot**. Every machine with an
  existing `pgdata` volume — this one included — needs the extension created by hand or the
  volume dropped. Add that sentence to `S1.13`'s page; without it the flags are on, the extension
  is absent, and `pg_stat_statements` reads as an empty view rather than an error.
  `corrected: 2026-09-13, second pass` — **the port mapping and the healthcheck are wrong for
  this image.** `edoburu/pgbouncer` listens on **5432** inside the container
  (`listen_port = 5432` in its generated `pgbouncer.ini`), so `${PGBOUNCER_PORT:-6432}:6432`
  maps the host to a port nothing answers on, and `pg_isready -h localhost -p 6432` would report
  the service unhealthy forever. Write `${PGBOUNCER_PORT:-6432}:5432` and `pg_isready -h
  localhost -p 5432 -U ratchet`; `pg_isready` itself is present at `/usr/bin/pg_isready`. Two
  env names confirmed against the entrypoint beyond the first pass's two: `SERVER_RESET_QUERY`
  (line 151) and `SERVER_RESET_QUERY_ALWAYS` (line 152) — the second is what `S1.13` decides
  about, see `S1.7`. `application_name` needs no entry in `IGNORE_STARTUP_PARAMETERS`; pgBouncer
  tracks it (`S1.1`).
  `done: 2026-09-13` — in the core stack, `${PGBOUNCER_PORT:-6432}:5432`, healthcheck on 5432,
  and healthy. Postgres carries the three command flags and reports them back.
  `postgres.init.sql` gained `pg_stat_statements` with the first-boot caveat written above it —
  and this machine needed the extension by hand, exactly as the caveat says, because its `pgdata`
  volume predates the line.
- [x] `S1.10` **`.env.example` and the scripts** — `DATABASE_URL` → `:6432`,
  `DATABASE_DIRECT_URL` → `:5432`, with the comment that the second is for DDL. `packages/infrastructure/package.json`
  `db:migrate` / `db:seed` / `db:generate` / `db:studio` and `drizzle.config.ts`,
  `migrate.ts`, `seed.ts` read `DATABASE_DIRECT_URL ?? DATABASE_URL`. `tooling/scripts/boot-smoke.mjs`
  waits on both ports. **Docs:** `docs/setup/11`, `docs/setup/13` §13.5.
  `verified: 2026-09-13` — this item's premise is the sharpest one in Phase 1 and it holds
  exactly. Pointed at a transaction-mode pgBouncer **without** `statement_timeout` in the ignore
  list, the repository's own `Database` does not connect: pgBouncer closes the socket with
  `unsupported startup parameter: statement_timeout` before authentication, and drizzle surfaces
  it as a bare `Failed query`. With the four names in the list it connects, and `SHOW
  statement_timeout` reads `0` — the same connection reads `30s` on `:5432`. So the pooler does
  not weaken the timeout, it removes it, and `S1.7` is not an optimisation but the only thing
  standing between a pooled deployment and unbounded statements.
  `corrected: 2026-09-13, second pass` — "`tooling/scripts/boot-smoke.mjs` waits on both ports"
  describes a capability the script does not have: it spawns `apps/worker/dist/main.js` and
  waits for the `process.started` log line, and contains no port logic at all
  (`compose-wait.mjs` is the health poller, and it has none either). Write the item as "gains
  a wait on both ports" or drop the clause — measured through `:6432`, the boot smoke passes as
  it is (`process.started` with five consumers, `process.stopped`, exit 0).
  `done: 2026-09-13` — `.env.example`, `drizzle.config.ts`, `migrate.ts` and `seed.ts` all read
  `DATABASE_DIRECT_URL ?? DATABASE_URL`, and both ran clean over `:5432` while the apps run over
  `:6432`. **The `boot-smoke.mjs` clause is dropped rather than built**, on the simplicity rule: a
  port wait prevents no failure the existing connection error does not already name, and the boot
  smoke passes through the pooler as it stands. The package.json scripts needed no change — they
  pass the environment through and the scripts choose.
- [x] `S1.11` **The archive's DDL goes direct** — `PgActivityArchiveGateway`'s
  `detach … concurrently` cannot run inside a transaction, and the role floor `S1.7` sets is
  the wrong ceiling for it; it takes a second `Database` built from `directUrl` (the container
  owns it, `dispose()` closes it), and `PgMaintenanceGateway`'s partition DDL uses the same
  handle. **Docs:** `packages/infrastructure/docs/reference/activity-archive.md`.
  `corrected: 2026-09-13` — **"must not run through a transaction pooler" was wrong, and it was
  this item's whole stated reason.** Measured against a scratch partitioned table:
  `alter table … detach partition … concurrently` **succeeds** through pgBouncer in transaction
  mode as a single statement, and fails identically on both paths — pooled and direct — the
  moment it is inside `PgUnitOfWork.run`: `ALTER TABLE … DETACH CONCURRENTLY cannot run inside a
  transaction block`. The constraint is the transaction, not the pooler, and the code already
  honours it by not making `archive()` one. Nor does the rest of the method need session
  affinity: `rows()` pages by keyset with no server-side cursor, so every statement in the
  detach → stream → record → verify → drop sequence stands alone.
  What survives is a smaller and different argument, and the item is kept on it: after `S1.7`
  every pooled session inherits `statement_timeout = 30s` and `lock_timeout = 10s`, and a
  month-sized `drop table` or a detach waiting behind a long reader will exceed both. A direct
  handle is where the archive can set its own. The cost of being killed mid-detach is not a
  retry either — Postgres leaves the partition detach-pending until someone issues
  `ALTER TABLE … DETACH PARTITION … FINALIZE`.
  Rewrite the item's first clause before building it; a reader who acts on the old sentence
  will also believe the seed and the migrator need `DATABASE_DIRECT_URL` for a reason they do
  not have.
  `verified: 2026-09-13, second pass` — the FINALIZE path, reproduced, and it is worse than "a
  retry is not enough". A `detach … concurrently` cancelled by `statement_timeout` while a reader
  held the parent (`57014`) left `pg_inherits.inhdetachpending = true`, and in that state the
  month is **both invisible and unwritable**: `select count(*)` through the parent returned `0`
  for it, and an insert into it failed with `23514 no partition of relation … found for row`.
  `alter table … detach partition … finalize` completed it. Two consequences for the item.
  First, the gateway's `reattach()` cannot recover this state — the partition is still a child,
  so `attach` is not the inverse — which means the archive's failure path must issue `finalize`
  (or `detach` again) rather than `attach` when the first detach was interrupted. Second, this
  is the strongest argument the item has for its own timeout: under `S1.7`'s 30 s floor an
  archive month behind one long reader is a month of `activity_log` that every use-case's
  in-transaction audit write then fails on.
  `corrected: 2026-09-13, second pass` — the surviving argument above is right for the archive
  and **backwards for `PgMaintenanceGateway.dropMonthlyPartitionsBefore`**, which `S1.11` puts on
  the same handle. `drop table <partition>` needs `AccessExclusiveLock` on the **parent**;
  measured, a drop behind one open reader waited on `probe_lock` (the parent, `granted: false`),
  timed out at the 2 s `lock_timeout` set for the probe (`55P03`), and a concurrent `select` on
  the parent blocked behind it until it did. Escaping `lock_timeout` for that statement re-enables
  an unbounded lock queue on `notifications` and `outbox_event` — every inbox read and every drain
  stalled behind one reader for as long as it reads. The maintenance drop keeps a **short**
  `lock_timeout` and retries on the next run; only the archive's detach and stream take the
  longer budget. Say so in the item and in `activity-archive.md`.
  `done: 2026-09-13` — `Container` builds a second `Database` from `directUrl` with `max: 1`, a
  30-minute statement timeout and its own `application_name`; `dispose()` closes it after the
  pooled one. `PgActivityArchiveGateway` takes it.
  **`PgMaintenanceGateway` deliberately does not**, which is the correction above applied rather
  than the item's original text: its `drop table` needs `AccessExclusiveLock` on the *parent*, so
  it keeps the role's short `lock_timeout` and retries on the next run instead of holding every
  reader of `notifications` and `outbox_event` behind it.
  `reattach()` now checks `pg_inherits.inhdetachpending` and issues `finalize` before `attach`.
  Without that the recovery path cannot recover: a cancelled detach leaves the partition a child,
  so `attach` is not its inverse, and the month reads as empty and rejects every insert.
- [x] `S1.12` **The pooled smoke spec** — `packages/infrastructure/tests/smoke/pooled.spec.ts`:
  through `DATABASE_URL`, `SHOW statement_timeout` inside a `PgUnitOfWork.run` equals the
  worker override and outside equals the role floor (`S1.7`); nested `run` is a savepoint that
  rolls back alone; two connections contend on `pg_advisory_xact_lock` and serialise;
  `PgOutboxGateway.drain` from two callers claims disjoint rows; through `DATABASE_DIRECT_URL`,
  `detach partition … concurrently` succeeds. Runs under `pnpm smoke`. **Docs:** `docs/setup/27`.
  `verified: 2026-09-13` — every case this spec is meant to assert was run by hand through
  `:6432` first, so the spec is being written against known answers rather than hopes. Nested
  `PgUnitOfWork.run` is a savepoint that rolls back alone (`1,3` survive an inner throw); two
  connections on `pg_advisory_xact_lock(918273)` serialise (`A-acquired → A-released →
  B-acquired`); two `PgOutboxGateway.drain` callers over twenty pending rows claim ten each with
  **zero** overlap, so `FOR UPDATE SKIP LOCKED` is unharmed by the pooler; and Better Auth's
  `drizzleAdapter` signs `alice@example.test` in through the pooled URL, writing a session and
  resolving `activeOrganizationId`, with `pg_stat_activity` showing the connections arriving from
  the pgBouncer container rather than the host. Add the Better Auth case to the spec's list — it
  is the path most likely to break on a pooler and the one nobody would think to write.
  `corrected: 2026-09-13` — the `detach … concurrently` case must assert the transaction
  boundary, not the URL: it succeeds on **both** URLs as a single statement and fails on both
  inside `run`. See `S1.11`.
  `corrected: 2026-09-13, second pass` — **the spec cannot be written where or how the item says.**
  `vitest.smoke.config.ts` includes only `tests/smoke/**/*.smoke.spec.ts` — the name must be
  `pooled.smoke.spec.ts` — and the `Stack` it `provide`s has **no database entry at all**: the
  smoke suite today is Redis, S3, Loki and ClickHouse. "Through `DATABASE_URL`" is impossible
  twice over: the test harness bans `process.env` (`check-architecture` §3 walks `tests/`), which
  is why `tests/support/database.ts:7` is a **literal** `localhost:5432`. The item owes
  `Stack.database: { url, directUrl }` provided from the config, read the way `stack.redis` is.
  Two smaller fixes: the advisory-lock case should use the two-argument
  `pg_advisory_xact_lock(int, int)` form every enroller and the claimer use, not a single
  bigint; and the Better Auth case belongs in the list (`verified:` above).
  `verified: 2026-09-13, second pass` — the existing suites through the pooler, which is the
  proof the Phase 1 Exit actually wants. With the literal in `tests/support/database.ts` pointed
  at `:6432` for one run (reverted, `git diff --exit-code` clean): **26 files, 145 tests, all
  green** — every enroller, the claimer, the founder, both messaging repositories, the outbox,
  maintenance, the vector store, the tenant cascade. Nothing in the repository's Postgres surface
  depends on session affinity.
  `done: 2026-09-13` — `tests/smoke/pooled.smoke.spec.ts` (the `.smoke.` infix the config
  requires), with `Stack.database: { url, directUrl }` provided from `vitest.smoke.config.ts` the
  way `stack.redis` is. Six cases, all green under `pnpm smoke`: a non-zero `statement_timeout`
  through the pooler, `SET LOCAL` raising and restoring it, the savepoint rolling back alone,
  `pg_advisory_xact_lock(int, int)` serialising, two `drain` callers claiming disjoint rows, and
  `DETACH … CONCURRENTLY` succeeding as a statement while failing inside `run`.
  **The Better Auth case is not in it, and cannot be.** `packages/infrastructure` sits left of
  `packages/auth` in the layering, so a spec there may not import `AuthFactory`; and the auth
  package's own specs hand `AuthFactory` a stub `Database`, so there is no live-database test to
  add it to. It stays proven by hand (a sign-in through `:6432` writing a session and resolving
  `activeOrganizationId`) and unautomated. A `packages/auth` integration spec is the place for it
  if it ever earns one.
- [x] `S1.13` **Docs** — new `docs/infra/reference/pgbouncer.md` (why transaction mode, the
  startup-parameter trap and the role floor that closes it, what `DISCARD ALL` costs, sizing:
  `DEFAULT_POOL_SIZE × databases` against `max_connections`, and the managed-pooler swap), added
  to `docs/infra/reference/meta.json` and `docs/infra/index.md`; `docs/infra/reference/postgres.md`
  sizing paragraph rewritten around the pooler; `docs/setup/24` §24 pool paragraph and
  `apps/web/docs/reference/server-functions.md` "count pools across replicas" updated;
  `docs/opinions/data-and-scale.md` §5 row 4 marked built with the trigger now observable
  (`S1.5`); `docs/ai/rules/data.md` Redis bullet unchanged, a pooling line added under
  "non-negotiable"; `docs/ai/rules/workflow.md` command block gains `db:partitions`,
  `infra:up:sharded` (from later phases, written once here).
  `corrected: 2026-09-13, second pass` — "what `DISCARD ALL` costs" is a paragraph about a query
  this configuration never issues (`S1.7`, second correction). Replace it with the rule and the
  decision: no session-level `SET` anywhere, ever, with the measured pool-poisoning as the
  reason; and whether `S1.9` sets `SERVER_RESET_QUERY_ALWAYS=1` (one `DISCARD ALL` per
  transaction, which is a round trip on every `run`) or trusts the rule. Recommend the rule plus
  a grep assertion; the round trip is the cost of not trusting the tree. Two more paragraphs the
  page owes from this pass: `SHOW POOLS` and `query_wait_timeout` as the saturation signal the
  application cannot see (`S1.4`), and `RECONNECT`, never restart, as the only safe verb under a
  live worker (`S1.1`).
  `done: 2026-09-13` — new `docs/infra/reference/pgbouncer.md` with all of the above, registered
  in `reference/meta.json` and named from `docs/infra/index.md` (which gains a pgbouncer row in
  the file table, the ports table and the profile table). `postgres.md`'s sizing paragraph,
  connection table and init listing rewritten around the pooler; `unit-of-work.md` gains the
  `SET LOCAL` section; `docs/setup/13` §13.2, §13.5 and §13.6 annotated; both `env.md` pages gain
  a database section; `docs/opinions/data-and-scale.md` §5 row 4 marked built with the argument
  for taking it early; `docs/ai/rules/data.md` gains the pooling bullet.
  Two notes. `docs/ai/rules/workflow.md`'s command block said **`18 assertions`** — the drift the
  second verification pass found — and is now 20; the `db:partitions` and `infra:up:sharded`
  entries are left for the phases that add them, since naming a script that does not exist is the
  kind of doc defect `check:architecture` exists to catch. And "what `DISCARD ALL` costs" is
  replaced by the rule: no session-level `SET`, ever, with the measured pool-poisoning as the
  reason. `SERVER_RESET_QUERY_ALWAYS` stays off — the round trip per transaction is the price of
  not trusting the tree, and the tree is clean.

**Exit.** ✅ **Met 2026-09-13**, clause by clause, watched rather than assumed:

| Clause | Result |
|---|---|
| `pnpm infra:up` starts pgBouncer healthy | `Up (healthy)` |
| `pnpm db:migrate` applies the role migration over the direct URL | `0022`, and `pg_db_role_setting` carries all three |
| the web app and the worker connect through `:6432` | `pg_stat_activity` shows both arriving from the pgBouncer container |
| `pnpm smoke` includes the pooled spec green | `pooled.smoke.spec.ts`, 6 cases; suite 18 passed |
| `pg_stat_activity` shows `application_name` per process | `worker`, and `<app>-direct` for the archive handle |
| the worker prints `worker.pool.oversubscribed` once | `concurrency=19 poolMax=10`, at the defaults — no `DATABASE_POOL_MAX=2` needed |
| holding concurrent transactions prints `database.pool.saturated` | `waiting=1 total=2 max=2 forMs=2500` — after `S1.5`'s window was corrected |
| the health endpoint shows the pool | `pool: { total, idle, waiting, max }` on the report |
| `check:architecture` is 20/20 | 20/20, no skips |

Plus `pnpm typecheck`, `pnpm lint` over 986 files, and `pnpm test` — every package green.
The one Exit clause **not** met as written is `pg_sleep(10)`: a caller cannot wait ten seconds for
a connection, because `DATABASE_POOL_CONNECT_TIMEOUT_MS` rejects it at five. That is `S1.5`'s
correction, and the rehearsal uses four-second transactions instead.

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
  `corrected: 2026-09-13, second pass` — `ensureMonthlyPartitions` is not safe to call from two
  processes at once, and `S2.3` is about to do exactly that. Its `to_regclass` probe and its
  `create table … partition of` are two statements with no `if not exists` (the comment at
  `pg-maintenance.gateway.ts:52-64` explains why: `IF NOT EXISTS` cannot report what it did).
  Measured: two callers under `Promise.all` on two dropped months — one created both, the other
  rejected `42P07 relation "notifications_2026_10" already exists`. `S2.3`'s `jobId` dedupe holds
  only while the first job is still in the queue; two replicas booting a minute apart both run
  it. Fix here, in the gateway: `pg_advisory_xact_lock` on the table name inside a transaction
  around probe-and-create, keeping the `to_regclass` answer the caller needs. `S2.3` depends on
  this.
- [ ] `S2.3` **Runway at boot and the low-runway line** — `worker-bootstrap.ts` enqueues
  `partitions` once at start with a fixed `jobId: "partitions-boot"` (BullMQ dedupes a second
  replica's copy), and `MaintenanceConsumer.partitions()` emits `partition.runway.low`
  (`warn`, `{ table, monthsAhead }`) when `monthlyPartitionsAfter` returns fewer than two after
  ensuring. `partitions.schedule.ts`'s comment about the 2027 deadline is updated to say the
  deadline is now recovered at every boot. **Docs:** `apps/worker/docs/reference/schedules.md`,
  `docs/setup/25` §25.6, `docs/setup/09b` code table.
  `verified: 2026-09-13` — the mechanism this builds on works. Five future `notifications`
  partitions were dropped by hand, leaving only the current month; the real `MaintenanceConsumer`
  (not the gateway — the consumer, built on a real `Container` and handed a `partitions` job)
  recreated them and logged `maintenance.partitions.ensured table=notifications created=2`.
  It also confirmed both halves of the gap this item closes: `PartitionsSchedule` registers
  `0 2 1 * *` and nothing else, so the recovery happens only if the worker is awake on the first;
  and the run emitted no runway line, because there is none to emit.
  One thing to write into the item: `ensureMonthlyPartitions` restores the **`MONTHS_PER_RUN`
  window**, not what was dropped. Five gone, two back. That is the intended behaviour and it is
  also why `partition.runway.low` has to count what exists rather than what the last run created
  — a run that creates zero is the healthy case and the starved case alike.
  **Depends on:** `S2.2`'s second-pass correction — without the lock, the boot-time call from a
  second replica fails on `42P07` and the failed job retries into the same race.

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
  `verified: 2026-09-13, second pass` — §21 passes on the tree as it stands: three
  `PARTITION BY RANGE` statements (`0000` `activity_log`/`occurred_at`, `0015`
  `outbox_event`/`occurred_at`, `0017` `notifications`/`created_at`), each `PRIMARY KEY` in the
  same statement carries the column, and no `DEFAULT` partition exists in any migration. The
  count edit is four sites in three files, not one — decision 12 names them — and
  `workflow.md:14` goes from `18` to twenty-three, not from twenty.
- [ ] `S2.5` **Pruning is proven** — `packages/infrastructure/tests/pg/partition-pruning.spec.ts`
  (integration, needs Postgres): for each of the three tables, insert into two months, run the
  slice's keyset query with a one-month window under `EXPLAIN (FORMAT JSON)`, assert exactly one
  `Append` child. This is the assertion that a future `WHERE` clause that drops the partition
  column is caught by a test, not by a slow production query. **Docs:**
  `packages/infrastructure/docs/reference/partitions.md` (new, `S2.8`).
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
  The spec is still worth having; it now has a fix to assert against. **Depends on:** `S2.9`.
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
- [ ] `S2.9` **The reads get a partition bound** — filed by the `EXPLAIN` at `S2.5`, which found
  that three of the four hot reads over a partitioned table scan every month. The shape is a
  floor, not a window: a read that walks backwards in time needs a lower bound it can push to
  the pruner, and the keyset cursor is the wrong half of the predicate.
  `UnreadQuery` gains `since: Date` and `PgNotificationRepository.list` adds
  `gte(notifications.createdAt, since)` beside the existing cursor clause, defaulted at the
  use-case to the retention horizon (`S2.1`'s `retentionMonths` for `notifications`, twelve) so
  the deep page still terminates and a caller cannot ask for an unbounded scan;
  `countUnread` takes the same floor. `PgOutboxGateway.drain` takes
  `occurred_at > now() - interval '<retentionMonths> months'` from the same entry — a pending row
  older than its own retention is one the prune has already dropped, so the bound costs nothing
  and removes a growing scan from the hottest loop in the worker.
  Then `S2.5` asserts one `Append` child per read, which is the state this item creates rather
  than the one it found. **Docs:** `packages/application/docs/reference/notification-policy.md`,
  `packages/infrastructure/docs/reference/partitions.md` (`S2.8`),
  `packages/application/docs/reference/ports.md` (the `UnreadQuery` shape).
  **Depends on:** `S2.1`.

**Exit.** `pnpm check:architecture` is 21/21 with §21 passing on the twenty-two existing
migrations; removing `notifications` from `PartitionedTable.ALL` fails §21; starting the worker
against a database whose future partitions were dropped by hand recreates them and prints nothing;
dropping them down to one future month prints `partition.runway.low`; `partition-pruning.spec.ts`
is green — which now means `S2.9` has landed, since on the tree as found it cannot be;
`pnpm db:partitions` prints three tables with their runway.

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
  `verified: 2026-09-13, second pass` — the tripwire is real: `test-container.spec.ts:30-37`
  reads `application/src/port/` with `readdirSync`, asserts the harness has exactly that many
  keys plus the four `NOT_PORTS`, and pins the sorted list. Four new port files break both in one
  commit, as the item says.

#### 3.A Schema (`infrastructure`)

- [ ] `S3.3` **`shard_assignments`** — `packages/infrastructure/src/pg/schema/shard.schema.ts`:
  `shard_key text primary key`, `virtual_shard smallint not null`, `assigned_at`,
  `moved_at` nullable; `shard_assignments_virtual_idx (virtual_shard)` for the move job. A
  catalog table, so no `organization_id` — §9's exemption set becomes derived from
  `CatalogTable` (`S3.18`), and this is the first table to rely on it. Migration
  `0023_*.sql`, generated, then hand-appended with the backfill:
  `insert into shard_assignments (shard_key, virtual_shard) select id::text, <fnv1a-mod-256 in SQL> from organizations on conflict do nothing`
  — the same function `S3.11` ships in TypeScript, with a spec asserting both agree on the
  pinned vectors. **Docs:** `docs/setup/13` §13.3 modelling notes, `docs/opinions/vocabulary.md`
  table list.
  `verified: 2026-09-13` — "FNV-1a in SQL" is real, in both the forms a migration could use, and
  both agree with `Math.imul(h, 0x01000193) >>> 0` on all ten pinned uuids (`206, 209, 145, 188,
  117, 226, 249, 143, 255, 48`). No script fallback is needed. The backfill takes the recursive
  CTE, so it stays one `insert … select` and leaves no function behind:

  ```sql
  with recursive fold(id, i, h) as (
    select id, 0, 2166136261::bigint from organizations
    union all
    select f.id, f.i + 1,
           ((f.h # get_byte(convert_to(f.id::text, 'UTF8'), f.i)::bigint) * 16777619) & 4294967295
    from fold f where f.i < octet_length(convert_to(f.id::text, 'UTF8'))
  )
  insert into shard_assignments (shard_key, virtual_shard)
  select id::text, (h % 256)::smallint from fold
  where i = octet_length(convert_to(id::text, 'UTF8'))
  on conflict do nothing;
  ```

  Two details the spec must pin, because getting either wrong is silent and re-places every
  tenant: the mask `& 4294967295` after **every** multiply, not once at the end, and `#` on a
  `bigint` — an `int` overflows the multiply before the mask can run.

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
  `corrected: 2026-09-13, second pass` — **four transactions in `src/` never pass through
  `PgUnitOfWork`, so the tripwire as designed never sees them.** `pg-organization.founder.ts:43`
  (`this.db.transaction`), `pg-personal-organization.enroller.ts:33`,
  `pg-invitation.claimer.ts:79` and `pg-bootstrap-membership.enroller.ts:53`
  (`this.database.client.transaction`) each open a drizzle transaction directly and call
  `this.scope.within(tx, …)` themselves — with no placement, because `within` has none yet. All
  four are catalog work, so the fix is mechanical and this item owns it: they take the catalog
  `PgUnitOfWork` and call `run`, which keeps the founder's "savepoint inside the enroller's
  transaction" behaviour because `run` already nests. `S3.12`'s sentence "passes the catalog unit
  of work to the enrollers, claimer and founder" describes constructor arguments those classes
  do not have today; after this correction they do.
- [ ] `S3.9` **`PgShardResolver`** — `pg/repository/pg-shard.resolver.ts`, `CapabilityCache`'s
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
- [ ] `S3.10` **`PgShardAssignmentRepository`** — `pg/repository/pg-shard-assignment.repository.ts`,
  `catalog` placement: `findByKey`, `save` (upsert, `moved_at` set when `virtual_shard` changes,
  then `resolver.invalidate(key)`), `all(page)` keyset over `shard_key`. Emits nothing; the
  founder emits `shard.assignment.created` (`info`, `{ key, virtualShard }`). **Docs:** `sharding.md`.
- [ ] `S3.23` **`PgNotificationRecipientReader.conversationMembers` is split** — filed by the
  audit at `S3.18`, and it is the only cross-placement query in the repository. The method joins
  `conversation_members` (routed) to `users` and `memberships` (both catalog) in one statement, so
  it has no plan at all once the two sit on different physical databases — unlike everything else
  in `CROSS_PLACEMENT_KNOWN`, which is empty apart from it.
  Split it the way decision 6 already prescribes for a crossing read: page the conversation's
  member ids off the routed shard first, then resolve those ids through the existing
  `users(organizationId, userIds)` on the catalog, which is already written, already one
  statement per page, and already applies the `deactivatedAt` filter this method needs. Two
  queries per page instead of one, both tenant-scoped, and the query count stays bounded by the
  page rather than the recipient list.
  Landing this empties `CROSS_PLACEMENT_KNOWN` before Phase 3 ends rather than at `S4.1`, which
  is the difference between §22 guarding a rule and §22 recording an exception.
  **Docs:** a new `packages/infrastructure/docs/reference/notification-recipients.md` — the
  reader's own comment already says "See docs/reference/notification-recipients.md" and that page
  has never existed, so the `EXISTS` claim it defers to is written down nowhere; registered in
  `reference/meta.json` and named from `packages/infrastructure/docs/index.md`. Also
  `packages/application/docs/reference/notification-policy.md`, `sharding.md`.
  **Depends on:** `S3.7`.

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
  principal-based for the web edge; `S3.15` derives the worker's key from the payload.
- [ ] `S3.12` **`Container`** — `container.config.ts` `database` becomes
  `{ url, directUrl, poolMax…, shards: readonly { index, url, directUrl, virtual }[] }`; both
  `env.ts` collect `DATABASE_SHARD_<n>_*` with a `z.preprocess` over `process.env` keys (still
  the one reader). `Container` builds `ShardMap` → `DatabaseCluster`, `ShardScope`,
  `PgShardResolver`, `PgShardAssignmentRepository`, both `PgUnitOfWork`s, binds
  `OrganizationShardingStrategy` and `HashShardPlacementPolicy`, passes the catalog unit of work
  to `container.rbac`, `container.member`, `container.apiKey`, the enrollers, claimer and founder,
  and the routed one to `container.notification`, `container.messaging`, `container.ai`;
  `PgOrganizationFounder.found` writes the assignment via the policy inside its transaction;
  `health()` reports `database: Record<index, boolean>` and `dispose()` closes the cluster last.
  `Container` exposes `shards: ShardScope`, `sharding: ShardingStrategy` and `cluster` for the
  edges (`S3.14`, `S3.15`). **Docs:** `docs/setup/17`, `packages/composition/docs/reference/container.md`.
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
  touches it, as decision 7 says, and not one line earlier.
  `verified: 2026-09-13` — decision 7's harder half holds, and it was the one worth checking.
  Of the fifteen `unitOfWork.run` call sites, fourteen are use-cases and every one of them
  injects repositories of a single placement — seven catalog (`rbac` ×5, `apikey` ×2), four
  catalog via `member`, two routed (`messaging`), one routed (`ai`, `VectorStore`). None writes a
  catalog table and a routed table in the same transaction, so decision 6's tripwire has no
  existing violation to forgive. The fifteenth is `PgOutboxGateway.drain` (local). (The first
  pass counted sixteen and named "the founder's own catalog transaction" as one; the sixteenth
  hit was a comment in `domain-event.publisher.ts:8`, and the founder does not use the unit of
  work at all — see `S3.8`.) Read in the second pass, the three routed bodies (`send-message`'s
  `write`, `create-conversation`'s `insert`, `index-document`) touch routed and local tables
  only; `ConversationAccess` reads `ConversationRepository` alone. Decision 6 has nothing to
  forgive in the use-cases.
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
- [ ] `S3.15` **Worker** — every consumer that builds `SystemPrincipal.forOrganization(orgId)`
  wraps its use-case call in `container.shards.within(container.sharding.keyOf(principal), …)`;
  a `withShard` in `apps/worker/src/bootstrap/` mirrors the web one. Platform consumers
  (`MaintenanceConsumer`, `OutboxConsumer`, `AnalyticsConsumer`'s replay, the archive) never set
  a key. **Docs:** `apps/worker/docs/reference/consumers.md`.
  `corrected: 2026-09-13, second pass` — "every consumer that builds
  `SystemPrincipal.forOrganization(orgId)`" is one consumer (`embedding`). The worker's two
  highest-volume routed paths run under `platform()` or a subscriber-built principal with the
  tenant in the event or job data (`S3.11`). The rule becomes: **every consumer whose job carries
  an `organizationId` enters `ShardScope` with `ShardKey.of(data.organizationId)` before calling
  the use-case**, and `OutboxConsumer.deliver` does the same per event with
  `event.organizationId` before dispatching to subscribers. `withShard(container, key, fn)` takes
  a key, not a principal. Platform consumers stay as written.
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
  §22: for every `pg/repository/pg-*.ts`, the tables it imports from **any** `../schema/*` path
  all share one placement (`local` mixes with either), or the file is in `CROSS_PLACEMENT_KNOWN`,
  which `S4.1` empties. The audited set, at `49703c9`, is one file:

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
  `activity_archive`, `__drizzle_migrations`) where decision 5's catalog is fifteen. Deriving one
  from the other would exempt `memberships`, `roles`, `role_permissions`, `goal_members`,
  `permission_overrides`, `invitations` and `api_keys` — seven tables that do carry
  `organization_id` and are exactly what §9 exists to police. Living on the catalog and carrying
  a tenant column are independent facts. `shard_assignments` joins `TENANT_EXEMPT` as one
  hand-written line, with a comment saying which of the two it is.
  `corrected: 2026-09-13, second pass` — §23's allowlist as stated ("only in the cluster and the
  scripts above `src/`") fails on landing. `.client` off a `Database` is read outside
  infrastructure `src/` at `packages/auth/src/factory/auth.factory.ts:55`
  (`drizzleAdapter(database.client, …)` — after `S3.5` it is handed `cluster.catalog().client`),
  `packages/infrastructure/seed.ts:31`, and inside `src/` by the three enrollers'
  `this.database.client.transaction` (`S3.8` removes those). `new Database(` has a fifth site the
  plan does not name, `packages/auth/tables.ts:116`, a script above `src/` in a different
  package; and there is **no** `packages/infrastructure/smoke.ts` to allowlist — the package root
  holds `drizzle.config.ts`, `migrate.ts`, `seed.ts`. Name the real set.

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
  `corrected: 2026-09-13, second pass` — two things. The spec cannot be gated on
  `process.env.DATABASE_SHARD_1_URL`: `check-architecture` §3 walks `tests/` for `process.env`,
  and the smoke config's `provide` is the only door — `Stack.database.shard1Url?`, and the file is
  `sharded.smoke.spec.ts` or the config never includes it (`S1.12`). And "fails on
  `notifications.user_id → users` and `… organization_id → organizations`" names two of **nine**
  routed→catalog foreign keys, every one `ON DELETE CASCADE`: `notifications` → `organizations`,
  `users`; `notification_preferences` → `organizations`, `users`; `conversations` →
  `organizations`; `conversation_members` → `organizations`, `users`; `messages` →
  `organizations`; `document_chunks` → `organizations`. Which one the spec trips first depends on
  insert order; write the expectation as "a foreign-key violation naming a catalog table", and
  list the nine at `S4.1`.

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
  `verified: 2026-09-13, second pass` — the inventory the decision is about, from the schema
  files. Nine FKs from routed to catalog tables, all `cascade`: `notification.schema.ts:26,32,86,90`,
  `messaging.schema.ts:26,58,69,96`, `vector.schema.ts:24`. Two routed→routed, `no action`:
  `conversation_members.conversation_id` and `messages.conversation_id` (`messaging.schema.ts:64,100`)
  — unaffected by the split, they stay on one shard. Two deliberate non-FKs already in the shape
  option (a) produces: `messages.author_id` (`messaging.schema.ts:101-103`) and
  `notifications.event_id` (`notification.schema.ts:33-35`). Option (a) drops nine constraints
  and has to replace nine cascades with one sweep.
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
| 2026-09-13 | @sami | Premises tested against a live stack and the tree at `49703c9`; no phase started. Four hold as written — the startup-parameter trap (worse than described: through the pooler `statement_timeout` reads `0`, not a smaller number), `SET LOCAL` in `PgUnitOfWork.run`, `ALTER ROLE` inside drizzle's migrator, and FNV-1a in SQL matching TypeScript on all ten vectors. `S3.14`'s guess is confirmed by experiment and is total, not partial: an oRPC middleware's `AsyncLocalStorage` reaches a unary handler and reaches an async-generator handler on no frame at all. Four are wrong and are corrected in place: `S1.11` (`DETACH … CONCURRENTLY` succeeds through a transaction pooler; the transaction, not the pooler, is the constraint), `S2.5` (the notification read carries no lower bound on the partition column, so it scans every month — new `S2.9`), `S3.12` (four of six use-case group names do not exist), `S3.18` (`CROSS_PLACEMENT_KNOWN` is one file and §22 as specified could not see it — new `S3.23`; and §9's `TENANT_EXEMPT` must not be derived from `CatalogTable`). Two smaller ones: the migration numbers shift by one, and `S1.7` needs a pooler reconnect it did not ask for |
| 2026-09-13 | @sami | **Phase 1 built and its Exit met.** Pool configuration, `Database.stats()`, the saturation and oversubscription lines, migration `0022`'s role floor, `SET LOCAL` in `PgUnitOfWork`, pgBouncer in the core stack, the scripts on `DATABASE_DIRECT_URL`, the archive on a direct handle with a FINALIZE recovery, `pooled.smoke.spec.ts`, and the docs. Four things the build changed that verification had not: `S1.5`'s fixed 5 s window could never fire against a 5 s connect timeout and is now derived from it; `S1.6` sums 19 rather than 20, because the analytics consumer does not start without ClickHouse; `PgUnitOfWork` needed `sql.raw` because Postgres takes no bind parameter in a `SET`, and a nested `run` must set nothing at all; and the Better Auth smoke case is impossible where the plan put it, because `infrastructure` sits left of `auth`. `S1.10`'s `boot-smoke.mjs` port wait was dropped rather than built |
| 2026-09-13 | @sami | Second pass, stricter: the first pass's own rigor gaps closed and every tree claim outside the fourteen items checked. Confirmed by measurement: drizzle's real statements with bound parameters scan every partition with zero runtime pruning (`S2.5` table rewritten from them); S3.14 over a real `RPCHandler` and a `Request`, frame 0 included, with the snapshot fix; FNV-1a on multibyte keys; the whole infrastructure suite — 26 files, 145 tests — green through pgBouncer; boot smoke green through it. Newly found: a pgBouncer **restart** kills an idle worker (`Database` has no `pool.on("error")`; `S1.1`) while `RECONNECT` does not; `server_reset_query` never runs in transaction mode, so one session-level `SET` poisoned all 25 fresh clients (`S1.7`, `S1.13`); pooler-side queueing is invisible to `waitingCount` (`S1.4`); S1.9's port mapping and healthcheck are wrong for the image; an interrupted `DETACH CONCURRENTLY` leaves a month invisible **and unwritable** until `FINALIZE`, and `reattach()` cannot recover it (`S1.11`); `drop table` on a partition locks the parent, so maintenance DDL must keep a short `lock_timeout` (`S1.11`); `ensureMonthlyPartitions` races between replicas with `42P07` (`S2.2`); the worker's routed paths run under the NIL platform principal with the tenant in the payload, so `keyOf(principal)` cannot route them (`S3.11`, `S3.15`); four catalog transactions bypass `PgUnitOfWork` (`S3.8`); the smoke harness has no database and bans `process.env`, so `pooled.spec.ts` and `sharded.spec.ts` cannot exist as named (`S1.12`, `S3.20`); §23's real sites and the fifth `new Database(` (`S3.18`); nine routed→catalog FKs, not two (`S3.20`, `S4.1`); `workflow.md:14` already says `18`. First-pass text fixed: fifteen `run` sites not sixteen, `member` is four not five, and the `DISCARD ALL` mechanism |

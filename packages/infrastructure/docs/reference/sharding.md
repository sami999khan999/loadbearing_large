---
title: Sharding
description: One key, one node, three placements — how a query finds its database, and the tripwire that makes a single-Postgres deployment reveal every use-case a split would break.
---

# Sharding

Not about running more Postgres — about being able to later without discovering then which use-cases
assumed one.

| Piece | Where | What it answers |
|---|---|---|
| `ShardingStrategy` | `composition/src/shard/` | what a request is placed *by* |
| `ShardResolver` | `pg/repository/pg-shard.resolver.ts` | which node that key lives on |
| `ShardAssignmentRepository` | `pg/repository/` | the directory both read |
| `ShardScope` | `pg/transaction/shard-scope.ts` | which shard the ambient work belongs to |
| `DatabaseCluster` | `pg/primitive/database-cluster.ts` | the pool for a node |
| `TablePlacement` | `application/src/primitive/shard.ts` | which of the three a *table* is |

## The organization is the shard, and there is no number in between

D28 removed the virtual shard: `shard_assignments` is `(shard_key, node)`, one legible row per customer
naming a machine, no bucket count to rebalance. The cost: a move is one tenant's rows, unbatched.

## `keyOf` runs once per request, and so does `resolve`

Both run in the middleware after the principal, into `ShardScope` as `{ key, node }` — **so
`BaseRepository.db` stays synchronous**: one `await` per request, and the 183 `this.db` call sites never
learned of sharding. The cache is read-through on `shard:key:<key>` for **300 s** (not
`CapabilityCache`'s 60: placements change on a move, which invalidates explicitly).

## Three placements, and the tripwire between them

`TablePlacement.of` is the only list; each repository **declares** its placement (a guess is wrong once):

- **catalog** — what a principal is built from before a key is known, plus RBAC, the two
  tenant-less lookups, the archive index and the policy rows. Nineteen tables.
- **local** — present on every node, written in whichever transaction is open: `activity_log`
  and `outbox_event`.
- **routed** — everything a tenant produces. It is the **default**, so a new slice's table needs
  no edit here, and an unplaced table routes rather than silently reading the catalog.

`BaseRepository.db` throws when its placement disagrees with the open transaction's (`local` fits both).
`tests/primitive/placement.spec.ts` asserts a keyless routed read or `run`, a catalog read in a routed
transaction, and a routed transaction nested in a catalog one all throw — and same-placement passes.
**It throws on one node** — harmless today, data corruption the day there are two, so found in tests,
not production. `PgUnitOfWork` likewise refuses a routed `run` nested in a catalog one.

## The one read that crossed, and how it was split

`PgNotificationRecipientReader.conversationMembers` joined routed `conversation_members` to
catalog `users` and `memberships` in one statement. It is now two: the routed ids first, then the
catalog resolve — see
[notification recipients](notification-recipients.md).

It was the only crossing, so §22's `CROSS_PLACEMENT_KNOWN` is **empty** — an exception set never
emptied records a rule rather than guarding one.

## A sweep is placed on a node, not on a tenant

Cross-tenant passes run in `ShardScope.atNode` (`key: null`) via `Container.eachShard` — **serially**
(parallel multiplies the pool by node count); a failing node logs `shard.sweep.failed`, the rest run, the
first error rethrows. There a `local` table resolves to the walked node; outside any scope, node 0. Which
passes loop: [the consumers](../../../../apps/worker/docs/reference/consumers.md).

### `catalogDb` is the one sanctioned crossing

`PgPartitionArchiveGateway` detaches on the walked node and records in catalog `partition_archive` through
`BaseRepository.catalogDb` — which throws unless `local` and returns the catalog pool, not the open
transaction. The only one: a routed repository reaching the catalog is what `22.10` split to avoid.

## `PgShardResolver` is not a `BaseRepository`, and takes thunks

`DatabaseCluster.forKey` calls it, so it reads the catalog pool directly (routing would recurse). It takes
thunks (`() => Database`, `() => CacheStore`, `() => Logger`) because the cluster is built **with** it,
before pool and cache exist.

## A missing directory row is an error, not node 0

`0031` backfilled every tenant and the founder writes a row for each new one, so a missing row is a bug.
Guessing zero would misplace rows the day it is wrong: `shard.resolution.failed` at `error`, and a throw.

## A tenant delete sweeps its own directory row

`shard_key` is `text` with no foreign key (a fork may store a region), so nothing cascades:
`PgTenantRepository.delete` removes the directory row, then the organization. `partition_archive` reasons
alike to the opposite end — a cold object outlives its tenant on purpose (thirty days); a dead directory
row answers nothing.

## The directory has a screen, and it reads the directory rather than the cluster

`/platform/shards` (`platform.shards.read`): `PgShardMapReader` counts `shard_assignments` by node —
**not** the cluster (that reports this process's environment) and **not** joined to `organizations`
(which would hide orphaned rows). A node's tenants load only when expanded, paginated by name then id.
**The move button is live only with somewhere to go** (`hasShardMoves` = `cluster.size > 1`; disabled with
the reason on one node; otherwise one button per other node behind a freeze confirmation). Lookup takes an
id or slug via `organizations.id::text = $1`
([platform slice](../../../application/docs/reference/platform.md)).

## The tenant move

A move copies one tenant's rows, then flips its directory row. **Between copy and flip the rows exist
twice**, and a write to the source then is lost at the flip. Everything below closes that window.

| Step | Where | What it does |
|---|---|---|
| request | `MoveTenantUseCase` | every guard, then a `tenant-move` job on `QueueName.MAINTENANCE` |
| freeze | `beginMove` | sets `moving_to` in one `update … where`, then invalidates the cached placement |
| quiesce | `PgTenantMoveGateway.quiesce` | waits out writers that placed themselves before the freeze |
| prepare | `PgTenantMoveGateway.prepare` | the target's partitions, then its copy of the tenant's routed rows emptied |
| copy | `PgTenantMoveGateway.copy` | pages of 500 by `id`, `to_jsonb` out and `jsonb_populate_recordset` in |
| verify | `RelocateTenantUseCase` | counts both nodes; a target short of the source fails the move |
| flip | `completeMove` | node, `moved_from` and `source_droppable_at` in one statement, then invalidate |
| reclaim | `ReclaimMoveSourcesUseCase` | the nightly cleanup drops the source once the grace period ends |

- **The freeze refuses, not queues:** while `moving_to` is set, `PgUnitOfWork.run` throws
  `ForbiddenError("shard.move.inFlight")` for `routed`/`local` writes; reads use the source. Catalog writes
  pass (nothing catalog is copied).
- **So every routed write goes through `run`, even one statement** (`CR.11`) — `db` cannot tell reads
  from writes. Six use-cases once wrote outside a unit of work (read marks, a preference, a read
  position, `DeliverNotification`'s `saveMany`, a search's audit row), and an *update* evades the count
  check. A new routed write outside `run` is the same bug.

- **The cached placement is dropped twice** (`CR.10`) — a read-through racing `beginMove` could re-cache
  `frozen: false` for five minutes, so `quiesce` invalidates again after the settle.
- **Quiesce has two halves:** a pre-freeze request with an open transaction is waited out by a `SHARE`
  lock on the tenant's partitions (blocked by any `ROW EXCLUSIVE`); one not yet open, by the
  `moveSettleMs` settle (60 s).
- **A job re-reads its placement every transaction** (`24.2b`) — a long fan-out outlives the settle, and a
  late *update* evades the count check. `withShard` places jobs with `recheck`; `run` throws
  `shard.move.inFlight` on a freeze or node change and the job retries. Savepoints and catalog
  transactions skip it; cost: one cached resolve per job transaction.
- **`prepare` mirrors the source's months** from `pg_inherits` (last year's rows need last year's
  partition), not the seed's runway.
- **A failed move retries from nothing** — the freeze lifts and `prepare` empties the target first, so
  `verify` can trust *at least* the source's count.

**Catalog-transaction audit rows for a tenant off node 0 go through the outbox** (`24.2a`): catalog
transactions run on node 0, where a moved tenant's runway, archive and projection never look. So
`PgActivityLogger` publishes `activity.recorded` into node 0's outbox in the same transaction, and
`ActivityRelaySubscriber` writes it on the tenant's node (`on conflict do nothing`), about a second
later; a down worker only delays it, and reconciliation reports longer gaps. **A placement already in
scope wins over asking the resolver** — the founder's directory row is uncommitted when it audits
`organization.created` (two-node sign-ups failed "No shard assignment" from 2026-09-24 to 09-25).

**The `local` tables are copied, never emptied, and dropped from node 0 only at reclaim** — the copy
carries pre-move audit rows; a mid-copy catalog write is copied or caught by the count check; reclaim
carries rows newer than an hour before the flip, closing the verify-to-flip gap. `outbox_event` is never
swept for the tenant. A month archived by both nodes in the grace week upserts identical content.

**The way back is the grace period:** the flip stamps `moved_from` and `source_droppable_at` (seven days,
or `platform_policy.move_grace_days`). Moving back is allowed; a *third* node is refused
(`sourcePending`), since it would overwrite `moved_from` and orphan the old copy. **Proved under load** by
`tests/smoke/tenant-move.smoke.spec.ts` (`sharded` profile): four per-write-placed writers plus a 1.5 s
straggler lose nothing — and with `quiesce` a no-op the straggler is lost every run.

## What routing costs a request, measured

```bash
pnpm infra up sharded          # plus the two DATABASE_SHARD_1_* lines in .env
ROUTED_SCALE=1000 pnpm smoke
```

`tests/smoke/routed.smoke.spec.ts`, averaged over a thousand resolutions against the two-node
compose profile on one developer machine:

| Path | Per call |
|---|---|
| **warm** — one cache read | 679 µs |
| **cold** — cache read, catalog query, cache write | 2 568 µs |
| a cache invalidate, for reference | 667 µs |

This machine's Redis round trip is ~0.67 ms (the one-`DEL` invalidate row shows it); faster Redis moves
both rows together. **The shape is the finding:** a routed request pays one cache read, never a query; a
miss is three round trips, once per key per five minutes. The serial `eachShard` walk read two nodes'
`count(*)` in 135 ms.

### Writes under load — `24.6`

Eight tenants, four per node; each write is a request's path (cached placement, routed transaction
inserting one message), pools at the shipped 20, `ROUTED_SCALE=1000`:

| Level | Writers | Writes/s | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|
| 1× | 4 | 23 | 151 ms | 324 ms | 467 ms | 0 |
| 10× | 40 | 142 | 265 ms | 498 ms | 577 ms | 0 |

**Routing is not the time:** under 1 ms of 150; the rest is `fsync` (~100 ms on Docker Desktop/Windows).
10× writers bought 6× throughput (shared flushes), latency under 2×. **The test asserts correctness, not
numbers:** no failed write, every row on its tenant's node only. Provisioned-node numbers (`S.3`) are the
ones to plan with.

## Sharding by something else: four edits, and nothing else

A fork sharding by region or plan changes four places, and nothing else names the choice:

1. **`TenantKey`** in `application/src/primitive/partitioned-table.ts` (`"organization_id"`) — every
   table's `PARTITION BY LIST` column.
2. **The strategy** — `composition/src/shard/organization.strategy.ts`, body
   `Shard.keyOf(principal.organizationId)`.
3. **`TENANT_COLUMN`** in `check-architecture.mjs`, asserted equal to `TenantKey`.
4. **The worker's key derivation** — `apps/worker/src/bootstrap/with-shard.ts`.

`shard_key` stays opaque `text` (no migration for a region code); generator and seed read the alias.

## Read replicas

**The problem is staleness** — a replica replays late, so a write then a replica read can miss the row.
**`DatabaseCluster.readerAt` uses the replica only once caught up:** it reads the primary's
`pg_current_wal_lsn()` and the replica's `pg_last_wal_replay_lsn()`; caught up, the replica answers,
otherwise the primary. No caller reasons about lag. `replica.smoke.spec.ts` proves it on a live standby
(without the check, the first read misses).

| | cost |
|---|---|
| no replica configured, or the switch off | nothing — the same pool as before |
| a replica read | two round trips before the query, neither touching a table |
| a replica that is behind or down | those two, then the primary |

**Three conditions:** a configured replica (`DATABASE_REPLICA_URL`, `DATABASE_SHARD_<n>_REPLICA_URL`),
work placed with `replica: true` (from `platform_policy.replica_reads_enabled` via `withShard`), and a
repository asking through `BaseRepository.reader()` (inside a transaction, the transaction).
**What reads there:** the analytics projection (`PgActivityReplayReader.since`, `dailyCounts`, and the
assistant usage walk) and the public docs (`doc.fn.ts` places them with `replica: true`;
`PgDocPageRepository` and `PgDocSpaceRepository` read through `reader()`). The status panel adds the lag — `now() - pg_last_xact_replay_timestamp()`, zero
once everything received is replayed (an idle primary sends nothing).

`pnpm infra up replica` starts node 0's standby. See
[compose](../../../../docs/infra/reference/compose.md) for how it clones itself.

## Rehearsing the split

`pnpm infra up sharded` starts a second Postgres and pooler; uncomment `DATABASE_SHARD_1_*` and
`db migrate` covers both. `tests/smoke/sharded.smoke.spec.ts` (gated on `Stack.shard1` from
`vitest.smoke.config.ts`, since §3 bans `process.env` in tests) places two tenants and asserts:

- each key resolves to the node its row names;
- `shard_assignments` exists on the catalog and **not** on shard 1;
- a message written under a tenant placed on node 0 lands on node 0 and on no other node;
- a routed write under the tenant on node 1 lands on node 1, with no key reaching back to the
  catalog.

The last once asserted the opposite: ten shard-to-catalog keys failed node-1 inserts with `23503` until
`24.1` dropped them. The move spec runs on the same profile.

## What is not built, and why it is not

**No placement policy** — until a second node, it would be ceremony
([Simplicity](../../../../docs/opinions/simplicity.md)). **No second node in the default stack** — the
`sharded` profile is a rehearsal.

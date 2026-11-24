---
title: Partitions
description: Tenant first and month underneath, the allowlist as the whole policy, and pruning measured rather than assumed — what a partitioned table costs and what it buys.
---

# Partitions

**Every tenant-owned table is a tenant partition first.** Seven of them take
`PARTITION BY LIST ("organization_id")`, and the three that also grow with activity take
`PARTITION BY RANGE` again underneath, one child per month:

```
notifications                         ← the parent, LIST (organization_id)
└── notifications_<32hex>             ← one tenant,  RANGE (created_at)
    ├── notifications_<32hex>_2026_09
    └── notifications_<32hex>_2026_10
```

`outbox_event` is month-only: the once-a-second drain must not touch a partition per tenant. The month
level follows [`data.md`](../../../../docs/ai/rules/data.md)'s test (a table gaining twelve rows a year
gains nothing from it); the tenant level makes a tenant's read prune to one subtree, its data a
`drop table`, and a physical split a data move.

## The allowlist is the policy

`PartitionedTable.ALL`, in `packages/application/src/primitive/partitioned-table.ts`, is a frozen
list of `{ name, tenantKey, column, retentionMonths }`. It is the whole policy for every partitioned
table, in one place:

| Table | `tenantKey` | `column` | `retentionMonths` |
| --- | --- | --- | --- |
| `activity_log` | `organization_id` | `occurred_at` | 13 |
| `outbox_event` | — | `occurred_at` | 2 |
| `notifications` | `organization_id` | `created_at` | 12 |
| `messages` | `organization_id` | `created_at` | `null` — domain data |
| `conversations` | `organization_id` | — | — |
| `conversation_members` | `organization_id` | — | — |
| `notification_preferences` | `organization_id` | — | — |
| `document_chunks` | `organization_id` | — | — |

`tenantKey: null` = not split by tenant; `column: null` = tenant level only; `retentionMonths: null` =
retired only by a `retention_policy` row — for `messages` and its siblings, domain data archived, never
dropped (`26.4`). Retired tables go through [cold storage](cold-storage.md): detach, upload, verify, drop.

**Nothing reads a copy of this list** — `TenantPartitionSeed`, `MaintenanceConsumer.partitions()` and the
`PartitionedTableName` union all derive from it, so a new table is one entry (a fork sharding by store or
region edits `TenantKey` and its schema). §21 checks it against `migrations/*.sql` both ways: an unlisted
partitioned table gets no partition for a new tenant (a failed first insert), an unpartitioned entry
breaks every `ATTACH`.

## The parents are a migration; the children are a seed

Migrations create **parents only**; every child (tenant partition and runway months) comes from
`TenantPartitionSeed` — in the founding transaction, and run by `migrate.ts` for every organization after
a migration. A SQL copy would drift.

**Created standalone, then attached**, never `create table … partition of` (`ACCESS EXCLUSIVE` on the
parent for the transaction, stalling every read for a signup). `ATTACH PARTITION` takes
`SHARE UPDATE EXCLUSIVE` and an empty child needs no scan — **unless a foreign key points into another
partitioned table** (below). Names are `<table>_<32hex>[_<yyyy>_<mm>]`, the uuid validated against
`^[0-9a-f]{32}$` before `sql.raw`; the longest, `notification_preferences_<32>`, is 57 of 63 characters.

## No foreign key points into a tenant-partitioned table

**`PF.1` dropped the last two** (`messages` and `conversation_members` → `conversations`);
`tests/maintenance/tenant-partition.spec.ts` keeps them out. Measured costs:

- **Every signup's attach validated them** — the two slowest attaches.
- **Validation took `SHARE ROW EXCLUSIVE` on `conversations`** (sampled in `pg_locks`), five windows per
  signup with no conversation creatable on the node.
- **Drops had to detach first** — 60 of 142 s dropping 1 658 tenants was detaching `conversations`.

The code already enforced them (`ConversationAccess.assertMember` before every insert; nothing deletes
a conversation); the nightly `orphans` job counts dangling conversation ids, as it counts tenants since
`24.1`.

## Dropping a tenant: one statement per table, and never `CASCADE`

`TenantPartitionSeed.drop`, called by `dropTenantPartitions` (delete) and `PgTenantMoveGateway.dropOn`
(move reclaim):

- **No transaction** — each `drop table` commits alone, so `ACCESS EXCLUSIVE` lasts one statement (in one
  transaction a single reader held every parent; the spec proves it).
- **Fifty names per statement** — 11 611 partitions in 1 m 42 s, versus two tenants a minute (`4f45294`).
- **One `pg_class` probe** for all names; a gone tenant is `[]`, so retries finish.
- **Never `CASCADE`** — month children go anyway, and a cascade from one partition would drop a key from
  the parent for every tenant with only a `NOTICE`.

It walks the allowlist backwards, keeping order right if a sibling key returns.

## Two mechanics that are not optional

**Every partition key is in the primary key** (Postgres requires it of every unique constraint):
`(id, organization_id, created_at)` or `(id, organization_id)`; `Uuid.v7()` keeps it time-ordered.
`notifications_dedupe_uq` carries `created_at` too — sound **only** because it is the *event's* timestamp,
so a redelivery collides; a `defaultNow()` column would make a unique index that never fires.

**Drizzle cannot express `PARTITION BY`** (nor do its snapshots), so §21 reads migration text; tables are
ordinary `pgTable`s and the clause is appended to the generated DDL.

## Adding a partitioned table is three steps

1. **The schema**, with a composite primary key: `primaryKey({ columns })` naming every partition
   key. Drizzle emits the composite form only when the schema declares it.
2. **One allowlist line** in `PartitionedTable.ALL`, listed ahead of any table that references it.
3. **`pnpm db generate`.**

That is `drizzle-kit generate && tsx partition-ddl.ts`: the second opens only the journal's newest
migration (never an applied one — the migrator hashes whole files) and appends
`PARTITION BY LIST ("<tenantKey>")` (or `RANGE ("<column>")` without a tenant level) to each listed
`CREATE TABLE`; no children, idempotent. **It refuses rather than guesses:** a primary key missing a
partition key ("declare the composite primary key in the schema"), or a table an earlier migration made
unpartitioned (convert by hand — `0023`). A refusal leaves drizzle-kit's file; fix the schema and
regenerate.

**No `DEFAULT` partition, ever** — it turns a missing month into misplaced rows and makes that month's
`ATTACH` scan it. §21 fails on one.

## The runway, and what bounds tenants per node

`MaintenanceConsumer.partitions()` ensures three months per table per tenant (current plus two), so
two missed runs survive and a third is an outage. It reads the runway *before* ensuring and emits
`partition.runway.low` under two months (read after, it never fires).

**One read and one transaction per 200 tenants** (`ensureMonthlyPartitionsFor`, `PF.5`): take the
table's advisory lock **first** (else two booting replicas race to `42P07`), read all children in one
`pg_inherits` query, create only the missing months. The old per-tenant loop was 48 000 statements at
2 000 tenants; the prune pass reads each table's months in one query too.

## What a node carrying tenants actually costs

`tests/smoke/tenant-ceiling.smoke.spec.ts`, synthetic tenants via `TenantPartitionSeed`. **Postgres 17,
2026-09-24**, a busy developer machine (Docker Desktop, Windows) — distrust any move under 2×. Sixteen
partitions per tenant then (seven tenant-level plus three months × three tables; `widget_preferences`
since adds an eighth tenant-level one). **Before → after `PF.1`–`PF.5`:**

| tenants | signup DDL | drop one tenant | runway pass | plan |
| --- | --- | --- | --- | --- |
| 100 | 378 → 111 ms | 706 → 43 ms | 3.2 s → 70 ms | 0.58 → 0.30 ms |
| 500 | 645 → 150 ms | 228 → 88 ms | 11.6 s → 0.27 s | 0.67 → 0.36 ms |
| 2 000 | 354 → 377 ms | 127 → 42 ms | 35.6 s → 1.6 s | 0.31 → 0.21 ms |

Signup DDL is one tenant's probe, create and attach (`pg_stat_statements`, twenty signups); the first
2 000 row already ran after `0037`, so it barely moves. **Key cost, within one run:**

| attach, mean ms, 500 tenants | with the keys | without |
| --- | --- | --- |
| `conversation_members` | **116.1** | 6.7 |
| `messages`, a month | **108.6** | 2.4 |
| `notifications`, no key either way | 9.6 | 6.4 |

`SHARE ROW EXCLUSIVE` on `conversations`: 2 227 samples with the keys, **zero** without.

- **Planning time is flat** (0.2–0.7 ms at every count) — the point of the tenant level: one list
  partition before any month. It replaces `D29`'s "a few hundred tenants per node".
- **A tenant-level attach grows** (~3 ms at 100, ~27 ms at 2 000; it checks every sibling's bound) —
  hence `PF.3`'s **warm spares** ([enrollers](enrollers.md)).
- **The runway is ~0.8 ms per tenant per table** — 1.6 s at 2 000.
- **Judge `24.7`'s pooled partition on relation count** — attach time and lock arithmetic grow; plan time
  and runway do not.

## The lock table bounds an unpruned read

`max_locks_per_transaction` 1 024 × `max_connections` 200 = **204 800** shared lock slots. An unpruned
statement locks every leaf and tenant partition with all indexes (`pg_locks` after one root
`select count(*)`):

| table | indexes | locks per tenant | at full retention | one such read fails at |
| --- | --- | --- | --- | --- |
| `notifications` | 6 | (months + 1) × 7 | 12 hot + runway ≈ 15 months → 112 | **~1 800 tenants** |
| `activity_log` | 3 | (months + 1) × 4 | 13 + runway ≈ 16 months → 68 | ~3 000 tenants |
| `messages` | 3 | (months + 1) × 4 | no retention; 24 months → 100 | ~2 000 tenants, falling |

Two were removed: the digest's `SELECT DISTINCT organization_id` over `notifications` (`CR.22`, now
pages catalog tenants) and the orphan check's scan of all `messages` (`CR.21`, now one pruned,
self-committing statement per tenant). Every repository query carries the tenant, and `pg` sends unnamed
statements, planned with values and pruned. What still would:

- **A hand-typed query or browsing tool** on a root — `53200`, for every backend needing a lock while it
  holds the slots.
- **A named prepared statement on a partitioned parent** — generic plans lock everything before pruning.
  Never allowed.

The setting stays 1 024; past ~1 800 tenants, raise it (shared memory) or move tenants (`24.2`).

**`pnpm db partitions` is the same routine from a shell**, for the operator whose worker was down on
the first of the month. It prints a row per table per tenant:

```
┌─────────┬─────────────────┬──────────────────────────────────────┬─────────┬───────┐
│ (index) │ table           │ tenant                               │ created │ ahead │
├─────────┼─────────────────┼──────────────────────────────────────┼─────────┼───────┤
│ 2       │ 'notifications' │ '01a0b342-18da-7337-83c9-a39020f26f78' │ 2     │ 0     │
└─────────┴─────────────────┴──────────────────────────────────────┴─────────┴───────┘
1 of 4 had under two months of runway.
```

**`ahead` is before the run** — a zero means month end would have failed; `created` is the fix.

## Pruning is measured, not assumed

`tests/pg/partition-pruning.spec.ts` captures each repository statement drizzle actually issued
(`DatabaseConfig.logger`) and plans it with `EXPLAIN (FORMAT JSON)` and real parameters. **Which assertion
holds is the finding:**

| Assertion | Queries | What it protects |
| --- | --- | --- |
| **One tenant partition** | every tenant-scoped read | The tenant predicate — the neighbour's subtree is not in the plan |
| **Exactly one month** | `markRead`, `findById`, the activity daily rollup | An equality or a closed range on the time column |
| **The retention tail is pruned** | `listUnreadBetween`, the projection walk, `unreadCounts` | A floor — nothing older than it is in the plan |
| **Bounded by the newest message** | a conversation's first page, given `upTo` | A ceiling — nothing newer than the room's latest message is in the plan |
| **Bounded by the cursor's month** | the inbox's and a conversation's later pages | A ceiling — nothing newer than the cursor is in the plan, and the cursor is still an index condition |
| **Pinned at every month of the tenant** | the inbox's first page, a conversation's first page with no `upTo`, `countUnread`, `unreadSubjectHolders`, `markAllRead`, the outbox drain | Today's behaviour, deliberately |

The first row is proven against a second tenant with rows in both months (else it passes vacuously).

- **A row-constructor cursor does not prune** — `(created_at, id) < (at, id)` showed `Subplans Removed: 0`
  — so since `PF.6` later pages add a redundant `created_at <= at`, **beside it, never instead**: the
  expanded `OR` form prunes but demotes the cursor from `Index Cond` to `Filter`. The spec asserts the
  row constructor stays an `Index Cond`.
- **A floor cannot prune future months** (rows may land there): `created_at >= x` scans four of fifteen.
  "Exactly one" needs floor *and* ceiling.
- **The last row is a change detector** — a bound added later fails it and is lowered deliberately with
  fresh numbers.

Unbounded reads cost 0.21–0.87 ms at the fifteen-partition steady state, one tenant's months. **`messages`
has no steady state** (unretired by default), so its per-render reads — a room's first page, the list's
unread counts — carry their own bounds, asserted to prune.

## `messages` had to give up an index to join the list

`messages_client_uq` (the send's idempotency key) would need `created_at`, making every retry a new row —
so the dedupe is a Redis `SET … EX … NX` and `client_id` is an unindexed column. See
[messaging](../../../application/docs/reference/messaging.md).

## Converting a table that already holds rows

Postgres has no `ALTER TABLE … PARTITION BY`: create a partitioned parent, copy, swap under a lock.
`0023` dropped and recreated its seven tables because the kit ships no rows; a deployment with rows
copies and swaps.

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

One table is deliberately month-only: `outbox_event`. The drain polls it once a second and must not
touch a partition per tenant to do it.

The month level is the test
[`docs/ai/rules/data.md`](../../../../docs/ai/rules/data.md) applies — a table that gains twelve rows
a year is not one of them, and partitioning it by month buys nothing for the cost of every mechanic
below. The tenant level is a different question: it is what makes a tenant's read prune to one
subtree, a tenant's data a `drop table`, and a physical split a data move rather than a rewrite.

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

`tenantKey: null` is "not split by tenant"; `column: null` is "tenant level only, never pruned by
the calendar"; `retentionMonths: null` is "never retired at all", which for `messages` means domain
data nothing drops. Every table that *is* retired goes through [cold storage](cold-storage.md)
first: detached, uploaded, verified, and only then dropped.

**Nothing reads a copy of this list.** `TenantPartitionSeed` walks the tenant-partitioned entries,
`MaintenanceConsumer.partitions()` walks the month-partitioned ones per tenant, and
`PartitionedTableName` — the closed union every gateway signature takes — is derived from the same
array. Adding a partitioned table is one entry, not one entry plus a record somewhere else that can
disagree with it. A fork sharding on a store or a region edits `TenantKey` and its schema, and
nothing else.

`check-architecture` §21 asserts the list against `migrations/*.sql` in both directions: a table
partitioned in a migration and missing from the allowlist gets no partition for a new tenant and the
notice is a failed insert on their first write, and an entry no migration partitions names a table
every `ATTACH PARTITION` will be rejected against.

## The parents are a migration; the children are a seed

A migration creates the partitioned **parents only**. Every child — each tenant's partition and the
runway months under it — is created by `TenantPartitionSeed`, which runs in the same transaction as
the `organizations` insert on every path that founds a tenant, and which `migrate.ts` runs for every
existing organization the moment a migration has been applied.

One implementation creates partitions. A SQL copy of it inside a migration would be a second one
that drifts from it the first time the shape changes.

**Created standalone, then attached** — never `create table … partition of`. That form takes an
`ACCESS EXCLUSIVE` lock on the parent for the rest of the transaction, which would stall every read
on all seven tables for the length of a signup. `ALTER TABLE … ATTACH PARTITION` takes
`SHARE UPDATE EXCLUSIVE`, which blocks nothing a request does, and an empty child attaches with no
validation scan.

Partition names are `<table>_<32hex>` and `<table>_<32hex>_<yyyy>_<mm>` — the tenant uuid with its
hyphens stripped, validated against `^[0-9a-f]{32}$` before it reaches `sql.raw`. The longest is
`notification_preferences_<32>` at 57 of Postgres's 63 characters.

## Dropping a tenant: detach, then drop, and never `CASCADE`

`dropTenantPartitions` takes a tenant's whole subtree, and two things about it are not obvious.

**`DROP TABLE … CASCADE` on a partition of a *referenced* table destroys the foreign key.** A key
that references a partitioned table is a constraint on the **parent**, so cascading from one
partition takes it with it — for every tenant, permanently, with nothing but a `NOTICE` to say so.
Measured: after one `DROP … CASCADE` of one tenant's `conversations` partition, both
`conversation_members_conversation_fk` and `messages_conversation_fk` were gone from
`pg_constraint`, and every later write to either table was unchecked.

`ALTER TABLE <parent> DETACH PARTITION <child>` then a plain `DROP TABLE <child>` leaves the
constraint alone, and dropping a tenant partition takes its month children with it — so `CASCADE`
buys nothing and costs that.

**The order is the reverse of the allowlist, and that is why the allowlist is ordered.** Postgres
refuses to detach a referenced partition while rows still point into it:

```
ERROR: removing partition "conversations_<32hex>" violates foreign key constraint
DETAIL: Key (conversation_id, organization_id)=(…) is still referenced from table "conversation_members".
```

So `PartitionedTable.ALL` lists a table **ahead of** the tables that reference it, and the drop walks
it backwards. `conversations` sits above `conversation_members` and `messages` for exactly that
reason, and `tests/maintenance/tenant-partition.spec.ts` drops a populated tenant and reads
`pg_constraint` back, which is what catches the order being broken.

## Two mechanics that are not optional

**Every partition key is in the primary key.** Postgres requires every unique constraint on a
partitioned table to carry every partition key, so a two-level table is keyed
`(id, organization_id, created_at)` and a tenant-only one `(id, organization_id)`. `Uuid.v7()` is
time-ordered, so the key still increases with the month and the composite costs nothing in index
locality.

That rule reaches the foreign keys too. `conversations` is keyed on the pair, so
`messages.conversation_id` and `conversation_members.conversation_id` are composite references on
`(conversation_id, organization_id)` — declared with drizzle's `foreignKey({ columns, foreignColumns })`,
which is the only form that can express them.

This propagates. `notifications_dedupe_uq` carries `created_at` for the same reason, and that is
sound **only** because the value written is the *event's* timestamp rather than the clock's — a
redelivered event computes the same value and collides with itself. A dedupe index carrying a
`defaultNow()` column would be a unique index that never fires.

**Drizzle cannot express `PARTITION BY`,** and its snapshots do not know the clause exists — which
is why §21 reads the migration text rather than the schema. Every partitioned table is declared as
an ordinary `pgTable` so the query builder types it, and the clause is written onto the generated
DDL afterwards.

## Adding a partitioned table is three steps

1. **The schema**, with a composite primary key: `primaryKey({ columns })` naming every partition
   key. Drizzle emits the composite form only when the schema declares it.
2. **One allowlist line** in `PartitionedTable.ALL`, listed ahead of any table that references it.
3. **`pnpm db:generate`.**

That last one is two halves — `drizzle-kit generate && tsx partition-ddl.ts`. The generator opens
only the migration the last `meta/_journal.json` entry names, which is the one just written and
never an applied one, because the migrator hashes each file's whole text. For every `CREATE TABLE`
whose table is on the allowlist and carries no clause yet, it appends
`PARTITION BY LIST ("<tenantKey>")`, or `RANGE ("<column>")` for a table with no tenant level. It
creates no children — those are the seed's — and running it twice rewrites nothing.

**It refuses twice rather than guessing.** A primary key that omits a partition key stops the run
with *"declare the composite primary key in the schema; the generator does not synthesize keys"* —
the fix is the schema, not the migration. And a table an earlier migration already created
unpartitioned stops it too: converting a live table is the copy-and-swap below, written by hand.
`0023` is exactly that case, which is why it is hand-written.

A refusal leaves the file `drizzle-kit` wrote already on disk. Fix the schema and regenerate; the
migration has not been applied, and the journal entry is rewritten with it.

**No `DEFAULT` partition, ever.** A default partition turns "the month nobody created" from a failed
insert into a row in the wrong place, and the next `ATTACH` of that month has to scan the default to
prove it holds nothing. §21 fails the build on one.

## The runway, and what bounds tenants per node

`MaintenanceConsumer.partitions()` runs monthly and ensures three partitions per table per tenant —
the current month and the next two — so two consecutive missed runs survive and the third is an
outage. It reads the runway *before* ensuring and emits `partition.runway.low` when fewer than two
months lie ahead; read after, it could never fire, because the run that just fixed the runway has
nothing to report.

**The DDL per month is tenants × three tables**, one statement each. The loop pages tenants from the
catalog and takes them a page at a time, so a month's worth of tenant DDL is a slow background
trickle rather than one lock storm on the first.

`ensureMonthlyPartitions` holds one advisory lock per table for the whole probe-and-create, because
that is two statements: two replicas booting together both probe absent and one gets `42P07`.

## What a node carrying tenants actually costs

Measured by `tests/smoke/tenant-ceiling.smoke.spec.ts`, which creates synthetic tenants through
`TenantPartitionSeed` and times three things. **Postgres 17, 2026-09-18**, on a developer machine
(Docker Desktop on Windows), against an otherwise idle database:

| tenants | partitions | create | plan | exec | runway | migrate no-op |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 1,622 | 142 s | 0.60 ms | 0.08 ms | 1.5 s | 14 ms |
| 500 | 8,022 | 709 s | 0.21 ms | 0.03 ms | 6.5 s | 11 ms |

Sixteen partitions per tenant: seven at the tenant level, plus three months under each of the three
tables that carry a month level.

**Planning time does not grow with the tenant count, and that is the whole point of the tenant
level.** The predicate prunes to one list partition before the planner considers a month, so a read
costs what one tenant's subtree costs however many neighbours there are. The two readings differ by
less than half a millisecond and the larger one is the *smaller* count — that is measurement noise
on a sub-millisecond number, not a trend.

**The runway is linear and cheap**: ~13 ms per tenant per run, so 6.5 s at 500 and about half a
minute at 2,000. Ten minutes — the point `24.7` says to reopen at — is somewhere near fifty thousand
tenants on this hardware, which no single node will reach first for other reasons.

**The cost that actually binds is signup.** Creating one tenant's sixteen partitions took 1.4–1.8 s,
and that is paid inside the transaction that creates the organization. It is per tenant rather than
per node — it does not get worse as a node fills — but it is a second of DDL on the signup path, and
a deployment where signups are frequent should measure it against its own hardware before assuming
the number above.

**Two thousand was not run.** At the rate above it is about fifty minutes of creation and half an
hour of cleanup, and nothing in the two readings suggests the shape changes. Run it with
`TENANT_CEILING=2000 pnpm smoke` before trusting a node with that many.

**Reopen [`24.7`] when** a pruned read's planning time passes 5 ms, or a runway run passes ten
minutes, at a tenant count a deployment could plausibly reach.

**`pnpm db:partitions` is the same routine from a shell**, for the operator whose worker was down on
the first of the month. It prints a row per table per tenant:

```
┌─────────┬─────────────────┬──────────────────────────────────────┬─────────┬───────┐
│ (index) │ table           │ tenant                               │ created │ ahead │
├─────────┼─────────────────┼──────────────────────────────────────┼─────────┼───────┤
│ 2       │ 'notifications' │ '01a0b342-18da-7337-83c9-a39020f26f78' │ 2     │ 0     │
└─────────┴─────────────────┴──────────────────────────────────────┴─────────┴───────┘
1 of 4 had under two months of runway.
```

**`ahead` is what existed *before* the run**, which is the reading that matters: a zero there says
the next insert past month end would have failed. `created` is what this run had to add to fix it.
Read the other way round — after ensuring — the column could never be anything but healthy, which is
the same trap the consumer documents.

## Pruning is measured, not assumed

`packages/infrastructure/tests/pg/partition-pruning.spec.ts` captures each repository method's
statement through `DatabaseConfig.logger` — the query drizzle actually issued, not a copy written
beside it — and plans it with `EXPLAIN (FORMAT JSON)` and the real bound parameters. It asserts one
of three things per query, and **which one is the finding**:

| Assertion | Queries | What it protects |
| --- | --- | --- |
| **One tenant partition** | every tenant-scoped read | The tenant predicate — the neighbour's subtree is not in the plan |
| **Exactly one month** | `markRead`, `findById`, the activity daily rollup | An equality or a closed range on the time column |
| **The retention tail is pruned** | `listUnreadSince`, the projection walk | A floor — nothing older than it is in the plan |
| **Pinned at every month of the tenant** | `list`, `countUnread`, `existsUnread`, `markAllRead`, the outbox drain | Today's behaviour, deliberately |

The first row is the one the tenant level bought, and the spec proves it against a second tenant
that also holds rows in both months — otherwise it would pass on a database with one tenant in it
whatever the predicate said.

**A row-constructor cursor does not prune.** `(created_at, id) < (at, id)` is the keyset every inbox
page uses, and the partition pruner does not decompose it — measured at plan time and again with
`EXPLAIN (ANALYZE, FORMAT JSON)` against real parameters, where `Subplans Removed` was `0` on every
row. A paged read therefore *widens* rather than narrows: the cursor did not prune the newer
partitions either.

**A floor cannot prune a future month.** Rows can legitimately land in one, so `created_at >= x`
against the fifteen-partition steady state scans four — the current month, the one before it, and
the two months of runway ahead. "Exactly one" is reachable only with a floor *and* a ceiling, which
a "newest first" read does not have.

So the third row asserts what the system does today on purpose. It catches nothing on its own; it is
the change detector. A bound added later fails that assertion and is lowered deliberately, with the
numbers re-measured — rather than arriving as a badge that has quietly stopped counting old rows.

At the fifteen-partition steady state the unbounded reads cost 0.21–0.87 ms, which is why they were
left unbounded — and the tenant level narrows that set to one tenant's months rather than every
tenant's.

## `messages` had to give up an index to join the list

`messages_client_uq` on `(organization_id, conversation_id, client_id)` was the send's idempotency
key, and it cannot exist on a partitioned table without `created_at` in it — with `created_at` in it
every retry inserts a second row instead of colliding. The dedupe is a Redis `SET … EX … NX` now, and
`client_id` stays as a column with no index. See
[messaging](../../../application/docs/reference/messaging.md).

## Converting a table that already holds rows

The procedure is not "alter the table" — Postgres has no `ALTER TABLE … PARTITION BY`. A deployment
with rows creates a new partitioned parent, copies into it, and swaps the two under a lock. The kit
ships no rows in the seven tables `0023` rewrote, so that migration drops and recreates them in
place; a deployment that holds rows does the copy-and-swap instead.

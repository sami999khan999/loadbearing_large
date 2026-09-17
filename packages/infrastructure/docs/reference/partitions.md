---
title: Partitions
description: The allowlist is the policy, drizzle cannot express PARTITION BY, and pruning is measured rather than assumed — what a partitioned table costs and what it buys.
---

# Partitions

Three tables in this system are partitioned by month: `activity_log`, `outbox_event` and
`notifications`. Each grows with activity rather than with the calendar, which is the test
[`docs/ai/rules/data.md`](../../../../docs/ai/rules/data.md) applies — a table that gains twelve rows
a year is not one of them, and partitioning it buys nothing for the cost of every mechanic below.

## The allowlist is the policy

`PartitionedTable.ALL`, in `packages/application/src/primitive/partitioned-table.ts`, is a frozen
list of `{ name, column, retentionMonths }`. It is the whole policy for every partitioned table, in
one place:

| Table | Column | `retentionMonths` |
| --- | --- | --- |
| `activity_log` | `occurred_at` | `null` — the archive owns its lifecycle |
| `outbox_event` | `occurred_at` | 2 |
| `notifications` | `created_at` | 12 |

`retentionMonths: null` means *this table is never dropped by the calendar*. `activity_log` carries
it because [the archive](activity-archive.md) detaches a month, uploads it, verifies the object and
only then drops — a calendar drop running beside that would race the verification.

**Two consumers read this list rather than a copy of it.** `MaintenanceConsumer.partitions()` loops
every entry to ensure its runway and prune its tail, and `PartitionedTableName` — the closed union
every gateway signature takes — is derived from the same array. Adding a partitioned table is one
entry, not one entry plus a record somewhere else that can disagree with it.

`check-architecture` §21 asserts the list against `migrations/*.sql` in both directions: a table
partitioned in a migration and missing from the allowlist stops getting partitions the month its own
migration's runway ends, and an entry no migration partitions names a table every
`CREATE TABLE … PARTITION OF` will be rejected against.

## Two mechanics that are not optional

**The partition column is in the primary key.** Postgres requires every unique constraint on a
partitioned table to carry the partition key, so `notifications` is keyed `(id, created_at)` and
`activity_log` `(id, occurred_at)`. `Uuid.v7()` is time-ordered, so the key and the partition column
still increase together and the composite key costs nothing in index locality.

This propagates. `notifications_dedupe_uq` carries `created_at` for the same reason, and that is
sound **only** because the value written is the *event's* timestamp rather than the clock's — a
redelivered event computes the same value and collides with itself. A dedupe index carrying a
`defaultNow()` column would be a unique index that never fires.

**Drizzle cannot express `PARTITION BY`.** Every partitioned table is declared as an ordinary
`pgTable` so the query builder types it, and the generated DDL is hand-edited before it is applied.
The schema files say so at the top of each. Its snapshots do not know the clause exists, which is
why §21 reads the migration text rather than the schema.

**No `DEFAULT` partition, ever.** A default partition turns "the month nobody created" from a failed
insert into a row in the wrong place, and the next `ATTACH` of that month has to scan the default to
prove it holds nothing. §21 fails the build on one.

## The runway

`MaintenanceConsumer.partitions()` runs monthly and ensures three partitions per table — the current
month and the next two — so two consecutive missed runs survive and the third is an outage. It reads
the runway *before* ensuring and emits `partition.runway.low` when fewer than two months lie ahead;
read after, it could never fire, because the run that just fixed the runway has nothing to report.

`ensureMonthlyPartitions` holds one advisory lock per table for the whole probe-and-create, because
that is two statements: two replicas booting together both probe absent and one gets `42P07`.

## Pruning is measured, not assumed

`packages/infrastructure/tests/pg/partition-pruning.spec.ts` captures each repository method's
statement through `DatabaseConfig.logger` — the query drizzle actually issued, not a copy written
beside it — and plans it with `EXPLAIN (FORMAT JSON)` and the real bound parameters. It asserts one
of three things per query, and **which one is the finding**:

| Assertion | Queries | What it protects |
| --- | --- | --- |
| **Exactly one partition** | `markRead`, the activity daily rollup | An equality or a closed range on the partition column |
| **The retention tail is pruned** | `listUnreadSince`, the projection walk | A floor — nothing older than it is in the plan |
| **Pinned at every partition** | `list`, `countUnread`, `existsUnread`, `markAllRead`, the outbox drain | Today's behaviour, deliberately |

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
left unbounded.

## `messages` is not partitioned

One table grows with activity and is not on the list. `messages_client_uq`
`(organization_id, conversation_id, client_id)` is the send's idempotency key, and it cannot exist on
a partitioned table without `created_at` in it — with `created_at` in it, every retry inserts a
second row instead of colliding. See
[messaging](../../../application/docs/reference/messaging.md) for the two alternatives that were rejected.

## Converting a table that already holds rows

Nothing here does that yet, and the procedure is not "alter the table" — Postgres has no
`ALTER TABLE … PARTITION BY`. A deployment with rows creates a new partitioned parent, copies into
it, and swaps the two under a lock. The kit ships no rows in these tables, so its own migrations
create the partitioned shape directly.

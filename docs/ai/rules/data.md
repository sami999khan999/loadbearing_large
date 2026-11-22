---
title: Data and scale
description: Which store owns which data, what is derived, and what is non-negotiable in any new schema.
---

# Data and scale

> **Postgres owns anything a transaction depends on or a user reads right after writing.
> Everything else is a derived store behind a port.**

| Stream | Written by | Store | Property |
|---|---|---|---|
| Domain data | use-cases | Postgres | transactional; read-after-write |
| Audit trail | `ActivityLogger` | Postgres, partitioned | must not be lost; **in-transaction** |
| Domain events | `DomainEventPublisher` | Postgres outbox, partitioned | **in-transaction**, at-least-once, drained by the worker |
| Diagnostics | `JsonLogger` | stdout → Loki | may be lost; 30-day retention |
| Analytics | worker, from domain events | Postgres snapshots → ClickHouse | derived; rebuildable |
| Retired months | the retention pass | S3 under `cold/`, indexed by `partition_archive` | archive-then-drop; restorable |

**The test:** if dropping a store loses information not recoverable from Postgres or S3, it has
become a source of truth. Run it whenever a store is added, especially one that is "just a cache".

- **Redis: two instances, because the jobs differ.** Capability and session caches are rebuildable;
  **BullMQ is not** (a lost job never happens). An evicted session is a read-through, never a
  sign-out.
- **Retention is archive-then-drop, never delete.** Each partitioned table's month (`outbox_event`
  included) is detached, streamed to `cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz`,
  recorded in `partition_archive` and verified **before** the drop. An absent row means "nothing
  to restore", not "not archived".
- **Retention length is data.** `retention_policy` (one row per store and table) and
  `tenant_retention_policy` (per tenant and table); an absent row means `PartitionedTable`'s
  default. Bucket lifecycle rules and the ClickHouse TTL are **converged to those rows nightly**,
  comparing first — `MODIFY TTL` rewrites every part.
- **A deleted tenant's cold objects stay thirty days from the delete.** The archive index has no
  foreign key, so nothing cascades: the delete stamps `deleted_at` on that tenant's rows and the
  nightly sweep reads that, never `archived_at` (which would drop old months the next night).
- **ClickHouse is purely derived.** Only the projection consumer writes to it.
- **Every query is tenant-scoped.** A cross-tenant aggregate cannot be sharded; it belongs in the
  analytics store.

**Every new schema:**
- `organization_id` on every domain table, as a branded `OrganizationId`.
- An index **leading with** every foreign key and filtered column (Postgres does not auto-index
  FKs, and a tenant-first composite cannot serve a cascade).
- **Every tenant-owned table `PARTITION BY LIST (organization_id)` in the migration that creates
  it**, and tables that grow with activity `PARTITION BY RANGE` underneath — converting later is a
  rewrite with downtime. Parents are the migration's; every child is `TenantPartitionSeed`'s. A
  table that grows with the calendar (`partition_archive`) takes no month level.
- Query-count assertions in integration tests for anything that loops.
- **No tenant foreign key from a routed table to the catalog** (decision `24.1`: Postgres enforces
  no key across databases). A tenant delete drops its partitions, sweeps `outbox_event` by hand
  (no tenant level), and a nightly pass counts leaks.
- **No foreign key into a tenant-partitioned table** (`PF.1`: every signup's attach validated them
  under a lock). Between catalog siblings, `NO ACTION`, never `RESTRICT`. The audit trail names no
  actor by foreign key.

**Connections and placement:**
- **Everything goes through pgBouncer in transaction mode.** It drops the startup
  `statement_timeout` (`SHOW` reads `0`), so a role default is the floor and `SET LOCAL` inside a
  transaction raises it. **Session-level `SET` is banned** — the reset never runs, so the next
  client inherits it. DDL a transaction cannot carry uses `DATABASE_DIRECT_URL`.
- **Every table is `catalog`, `local` or `routed`; the repository declares which.**
  `application/src/primitive/shard.ts` is the only list; `routed` is the default. A repository reads
  one placement (CI-asserted), and `BaseRepository.db` throws when a catalog repository is used in a
  routed transaction — on one node, today. The one sanctioned crossing is `catalogDb`, from `local`.
- **A cross-placement read runs before the transaction**, as two statements (routed ids, then
  catalog resolve), never a join. Worked example:
  `PgNotificationRecipientReader.conversationMembers`.
- **A cross-tenant pass loops nodes, not tenants** (`Container.eachShard`, serially). Exception: the
  projection loops tenants and places each, so a moved tenant resumes from its checkpoint.

**Do not build in advance:** running ClickHouse, a vector DB, a **second Postgres**, a broker. The
routing seam is the exception (`simplicity.md`): the swap is certain and the retrofit would span 183
call sites. "Seam implemented" and "store running" are separate decisions; only the second costs.

Argument: [`docs/opinions/data-and-scale.md`](../../opinions/data-and-scale.md).

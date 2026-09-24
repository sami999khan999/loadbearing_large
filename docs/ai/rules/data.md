---
title: Data and scale
description: Which store owns which data, what is derived, and what is non-negotiable in any new schema.
---

# Data and scale

> **Postgres owns anything a transaction depends on or a user reads immediately after writing.
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
become a source of truth — whether you decided that or not. Run it whenever a store is added, and
again the first time someone introduces one because "it is just a cache."

- **Redis has three jobs and they do not have the same answer.** Capability and session caches are
  rebuildable; **BullMQ is not** — a lost job is work that never happens. Hence two instances. An
  evicted session must be a read-through, never a sign-out.
- **Retention means archive-then-drop, never delete.** Every partitioned table's month is
  detached, streamed to `cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz`, recorded in
  `partition_archive` and verified **before** it is dropped — `outbox_event` included. An absent
  row means "nothing to restore", never "not archived", and a tenant delete has to sweep those
  objects itself, because the index carries no foreign key that could cascade.
- **How long is a row, and the allowlist is only the default.** `retention_policy` holds one row
  per store and table and `tenant_retention_policy` one per tenant and table; an absent row *is*
  `PartitionedTable`'s value, so an empty table behaves as the deploy before it existed. The
  bucket's lifecycle rules and the ClickHouse TTL are **converged to those rows nightly**, never
  written once and trusted — and compared before they are written, because `MODIFY TTL`
  materialises every part of the table.
- **A deleted tenant keeps its cold objects for thirty days, measured from the delete.** The
  archive index carries no foreign key, so nothing cascades; the delete stamps `deleted_at` on
  every one of that tenant's rows and the nightly sweep reads *that*, never `archived_at`. Keyed
  on the archive time the window would measure the age of each month instead, so a tenant with a
  year of cold storage would lose all but the newest months the night after the delete.
- **ClickHouse is purely derived and must stay so.** Only the projection consumer writes to it.
- **Never write a query that cannot be scoped to a tenant.** A cross-tenant aggregate in application
  code cannot be sharded; those belong in the analytics store from day one.

**Non-negotiable in any new schema:** `organization_id` on every domain table as a branded
`OrganizationId` · an index **leading with** every foreign key and filtered column, since Postgres
does not auto-index FKs and a composite that leads with the tenant cannot serve a cascade ·
**every tenant-owned table `PARTITION BY LIST (organization_id)` in the migration that creates it**,
and the ones that grow *with activity* `PARTITION BY RANGE` again underneath, because converting
later is a rewrite with downtime — the parents are the migration's, every child is
`TenantPartitionSeed`'s, and a table that grows with the calendar rather than with the work, like
`partition_archive`, takes no month level · query-count assertions in integration tests for anything that loops ·
**no tenant foreign key from a routed table to the catalog** — decision `24.1` dropped the ten
that existed, because Postgres enforces no key across two databases and a shard is one. A tenant
delete drops the tenant's partitions instead, sweeps `outbox_event` by hand because it has no
tenant level, and a nightly pass counts what leaked. **No foreign key into a tenant-partitioned
table either** — `PF.1` dropped the last two, because every signup's attach validated them under a
lock on the target. Between catalog siblings, `NO ACTION`, never `RESTRICT`. The audit trail names
no actor by foreign key either.

- **Every application connection goes through pgBouncer in transaction mode, and that changes what
  a timeout is.** `pg` sends `statement_timeout` as a startup parameter; the pooler drops it, and
  `SHOW statement_timeout` reads `0`. A role default is the floor, `SET LOCAL` inside a transaction
  is how work raises it, and **a session-level `SET` is banned outright** — in transaction mode the
  reset query never runs, so one `SET` is inherited by every later client on that connection. DDL a
  transaction cannot carry goes to `DATABASE_DIRECT_URL`.

- **Every table is `catalog`, `local` or `routed`, and the repository declares which.**
  `application/src/primitive/shard.ts` is the only list; `routed` is the default, so a new slice's
  table needs no edit there. A repository reads tables of one placement — a CI assertion — and
  `BaseRepository.db` throws when a catalog repository is used inside a routed transaction. **That
  throws on one node, today**, which is the difference between finding the call site in a test run
  and finding it the week of a split. The one sanctioned crossing is `catalogDb`, from `local`
  only.
- **A read that crosses placements runs *before* the transaction, never inside it.** Two statements
  — the routed ids, then the catalog resolve — not one join: a join has no plan across two
  databases, and doing the catalog half inside a routed transaction is the coupling the split
  cannot honour. `PgNotificationRecipientReader.conversationMembers` is the worked example.
- **A cross-tenant pass loops nodes, not tenants** — `Container.eachShard`, serially. The
  exception is the projection, which loops tenants and places each: one ClickHouse for the
  deployment means one checkpoint per tenant, so a tenant that moves resumes where it was.

**Do not build in advance:** starting ClickHouse, a dedicated vector DB, a **second Postgres**, a
broker. The routing seam is built — that is the exception `simplicity.md` names, because the swap
is certain and the retrofit would be spread over 183 call sites rather than one adapter. *"The
seam is implemented"* and *"the store is running"* are two decisions, and only the second costs
anything to be wrong about.

---

**The argument.**
[`docs/opinions/data-and-scale.md`](../../opinions/data-and-scale.md) — which store owns which data, what is derived, the order scaling moves happen in.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**

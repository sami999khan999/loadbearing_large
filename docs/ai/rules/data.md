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

**The test:** if dropping a store loses information not recoverable from Postgres or S3, it has
become a source of truth — whether you decided that or not. Run it whenever a store is added, and
again the first time someone introduces one because "it is just a cache."

- **Redis has three jobs and they do not have the same answer.** Capability and session caches are
  rebuildable; **BullMQ is not** — a lost job is work that never happens. Hence two instances. An
  evicted session must be a read-through, never a sign-out.
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
`activity_archive` at twelve rows a year, takes no month level · query-count assertions in integration tests for anything that loops ·
**every tenant foreign key `ON DELETE CASCADE`**, because that column is the only handle a tenant
delete has, and `NO ACTION` — never `RESTRICT` — between siblings, so the cascade is not rejected
by its own check. The audit trail is the one table that names no actor by foreign key.

- **Every application connection goes through pgBouncer in transaction mode, and that changes what
  a timeout is.** `pg` sends `statement_timeout` as a startup parameter; the pooler drops it, and
  `SHOW statement_timeout` reads `0`. A role default is the floor, `SET LOCAL` inside a transaction
  is how work raises it, and **a session-level `SET` is banned outright** — in transaction mode the
  reset query never runs, so one `SET` is inherited by every later client on that connection. DDL a
  transaction cannot carry goes to `DATABASE_DIRECT_URL`.

**Do not build in advance:** starting ClickHouse, a dedicated vector DB, sharding, a broker. *"The
seam is implemented"* and *"the store is running"* are two decisions, and only the second costs
anything to be wrong about.

---

**The argument.**
[`docs/opinions/data-and-scale.md`](../../opinions/data-and-scale.md) — which store owns which data, what is derived, the order scaling moves happen in.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**

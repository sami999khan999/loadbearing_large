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
`OrganizationId` · an index on **every** foreign key and filtered column, since Postgres does not
auto-index FKs · append-only tables **partitioned in the first migration**, because converting later
is a rewrite with downtime · query-count assertions in integration tests for anything that loops.

**Do not build in advance:** starting ClickHouse, a dedicated vector DB, sharding, a broker. *"The
seam is implemented"* and *"the store is running"* are two decisions, and only the second costs
anything to be wrong about.

---

**The argument.**
[`docs/opinions/data-and-scale.md`](../../opinions/data-and-scale.md) — which store owns which data, what is derived, the order scaling moves happen in.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**

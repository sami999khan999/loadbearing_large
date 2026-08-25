---
title: "@loadbearing/db"
description: Postgres, and the fact that db means Postgres. RBAC tables, a partitioned audit log, derived rollups, pgvector, and a UnitOfWork that genuinely enrols its repositories.
---

# `@loadbearing/db`

`db` means Postgres. Every other store has a port and an adapter in `infrastructure`; this one has a
whole package, because it is the source of truth and nothing about it is swappable.

| | |
| --- | --- |
| **Package** | `@loadbearing/db` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application` (the ports it implements), `contracts`, `core`, `permissions`, `drizzle-orm`, `pg` |
| **Used by** | `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |
| **Migrations** | generated, hand-edited where needed, committed |

```
packages/db/
├── drizzle.config.ts              ← points at src/schema/index.ts
├── migrations/                    ← generated SQL, committed
└── src/
    ├── index.ts                   ← ServerOnly.assert(), then the public surface
    ├── import.ts                  ← every external symbol, drizzle and pg included
    ├── schema/                    ← every table, and the drizzle-kit entry
    │   ├── index.ts               ← the one `export *` in the repository
    │   ├── rbac.schema.ts
    │   ├── activity.schema.ts
    │   ├── analytics.schema.ts
    │   └── vector.schema.ts
    ├── primitive/                 ← what every seam folder below depends on
    │   ├── database.ts            → Database, DatabaseConfig, DrizzleClient
    │   └── base.repository.ts     → BaseRepository
    ├── transaction/               → PgUnitOfWork, TransactionScope
    ├── rbac/                      → PgCapabilityRepository
    ├── activity/                  → PgActivityLogger
    ├── analytics/                 → PgAnalyticsReader
    ├── vector/                    → PgVectorStore
    ├── seed/                      → SystemRoleSeed
    └── migrate/                   ← the migration runner
```

**`src/` root is `index.ts`, `import.ts`, and folders — nothing else.** Putting the schemas in
`schema/` is what closed it: `index.ts` there is both the folder barrel and the entry
`drizzle.config.ts` names, so the loose `src/schema.ts` the earlier layout needed is gone.

> **This departs from [Folders](../../../docs/opinions/folders.md), which uses this package as its
> worked counter-example** and argues for schemas beside their subject. The trade is real: a team now
> owns `schema/rbac.schema.ts` and `rbac/pg-capability.repository.ts` in two directories. Decided
> deliberately, in exchange for a closed `src/` root and one obvious place drizzle-kit points at.

**One folder per seam, each holding its adapter** — the same shape
[`@loadbearing/infrastructure`](../../infrastructure/docs/index.md) uses, where `cache/` holds
`redis.cache-store.ts` and `storage/` holds `s3-storage.gateway.ts` beside `storage-key.ts`.
`transaction/` is that pattern applied here: `pg-unit-of-work.ts` is the adapter, `transaction-scope.ts`
is the value class it needs. A seam folder holding one file is normal and is not a smell — `cache/`
holds one too.

`primitive/` is what is left when the adapters are in their seams: `Database` and `BaseRepository`,
the two things with no layer role that every seam folder depends on.

**Every external symbol arrives through `import.ts`** — `pgTable`, `cosineDistance`, `Pool`,
`AsyncLocalStorage`, all of it. One file answers "what does this package take from outside itself".
The two exceptions are `import "dotenv/config"` in the seed and migrate runners: a bare side-effect
import has no symbol to re-export, so it has to happen where it is needed.

**Implementation filenames lead with the technology** — `pg-capability.repository.ts`,
`pg-activity.logger.ts`, `pg-analytics.reader.ts`, `pg-vector.store.ts`. You should be able to see
what you would delete when a vendor changes ([Files](../../../docs/opinions/files.md)).

**`schema/index.ts` is guarded by `check-architecture.mjs` §11.** An empty or incomplete barrel
passes typecheck, lint, build, and every test — `import * as schema` from an empty module is legal
and yields `{}`. The only tool that notices is drizzle-kit, and it notices by generating
`DROP TABLE` for everything it can no longer see. That is not hypothetical; it happened once here.


## Five ports, one base class

| Port (in `application`) | Implementation here |
| --- | --- |
| `CapabilityRepository` | `PgCapabilityRepository` — three queries, never one join |
| `ActivityLogger` | `PgActivityLogger` — writes inside the caller's transaction |
| `AnalyticsReader` | `PgAnalyticsReader` — reads derived rollups |
| `VectorStore` | `PgVectorStore` — pgvector with HNSW |
| `UnitOfWork` | `PgUnitOfWork` — `AsyncLocalStorage`, and it really enrols |

One class per file, so `TransactionScope` and `PgUnitOfWork` are two files rather than one — and
`Database.isHealthy()` carries the `is` prefix every boolean-returning method does
([Classes and methods](../../../docs/opinions/classes.md)).

Every one extends `BaseRepository` and *implements* the port. That is not a style choice: a class can
extend only one base, and `BaseRepository` is what resolves `this.db` to the open transaction when
there is one.

```ts
protected get db() {
  return this.scope.current() ?? this.database.client;
}
```

**That one line is what makes `UnitOfWork` real.** A `run()` that opens a transaction the repositories
never join is worse than none at all — every call site reads as atomic, none of it is, and the first
symptom is a state change with no audit row after a restart. There is a test for it, and it is the
only proof that matters.

## What the schema decides

**`organization_id` on every table.** Not because multi-tenancy is planned, but because it is the one
column that cannot be added cheaply later. `check-architecture.mjs` §9 asserts it, with three
exemptions that each have a reason: `organizations` *is* the tenant, Better Auth owns its own tables,
and `activity_archive` records a time partition that spans every tenant.

**`activity_log` is RANGE-partitioned by month, in the first migration.** Drizzle cannot express
`PARTITION BY`, so the generated DDL is hand-edited before it is applied — which is why migrations
here are generated, read, and committed rather than pushed. Converting a populated table later is a
rewrite with downtime.

There is deliberately **no `DEFAULT` partition**. A catch-all silently absorbs a month whose partition
is missing, and attaching the real one afterwards means moving rows. A missing partition should be a
failed insert, loudly.

**Every FK column has a covering index.** The gate query in [13](../../../docs/setup/13-db-package.md)
found one that did not — `role_permissions.organization_id`, whose unique index leads with `role_id` —
and an unindexed FK is what makes deleting an organization scan every grant.

**`user_id` is `text`, not `uuid`.** Better Auth owns the user table and generates its own identifier
format. Matching its type is what lets a real foreign key be added later.

## The rollups are derived, and that is a claim to keep true

`goal_risk_daily` and `user_reliability_daily` store the **final computed value** — the number a
dashboard reads without scanning. Both are written only by the projection consumer and rebuildable by
replaying `activity_log`.

They also store **the components the value was computed from**, and that is not redundancy:

- Changing the risk formula otherwise makes every historical row silently incomparable to every new one.
- `reliabilityTrend` aggregates across goals, and **a ratio cannot be averaged from per-goal ratios** —
  it has to be recomputed from the sums. The components are what make the query correct rather than
  approximately correct.

`activity_archive` is the manifest for cold storage: which month went to which object, how many rows
it held, and its checksum. The row count is what lets reconciliation cover months Postgres no longer
has — without it, verification silently stops at the retention boundary while ClickHouse keeps five
years.

## The vector store, and why the port is not here

`VectorStore` is declared in `application/src/port/`, not in this package. That matters the moment the
implementation is not Postgres: `application` cannot import `db`, so a use-case could not name the
type. `PgVectorStore` lives here because it is Drizzle code over a Postgres table.

Three rules keep the Qdrant swap cheap, and they are greppable:

1. **No `cosineDistance`, no `vector` column helper, outside `src/vector/`.**
2. **`search()` keeps its exact signature.** A Postgres-specific option on the port means the port now
   describes Postgres.
3. **Chunk ids are generated by the caller (`Uuid.v7()`), never by the store.** A store that assigns
   ids makes migration a re-keying exercise.

**An empty permitted scope means org-wide chunks only, never everything.** If it meant "no filter", a
bug that failed to compute the permitted set would grant the whole corpus and look like it worked.
There is a test for that too, and one for the cross-tenant case, because a `goal_id IS NULL` predicate
without a tenant predicate reads as correct in review and is not.

## Reference

- [Unit of work](reference/unit-of-work.md) — enrolment, nesting, and the test that proves it

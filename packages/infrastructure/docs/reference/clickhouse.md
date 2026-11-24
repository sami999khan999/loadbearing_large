---
title: ClickHouse
description: The derived analytics store — two adapters, one connection, and the two guards that keep it rebuildable rather than authoritative.
---

# ClickHouse

The one store allowed to be wrong: everything is a replay of `activity_log` (and `ai_usage`), so dropping
it and projecting from an empty checkpoint restores it. **That is the design** — adoption is a performance
decision, as long as the two guards below hold.

| | |
| --- | --- |
| **Folder** | `packages/infrastructure/src/clickhouse/` |
| **Ports** | `AnalyticsProjector` (write), `AnalyticsReader` (read, behind `GetActivityTrendUseCase`) |
| **Config** | `analytics.clickhouse` on `ContainerConfig`; `CLICKHOUSE_*` in the environment |
| **Container** | `container.projector`, `container.hasProjector`, `container.analytics.activity` |
| **Compose** | `--profile analytics`, stopped by default |
| **Dependency** | none — `fetch` against the HTTP interface |

---

## No client library

`ClickHouseConnection` is `fetch` over the HTTP interface, not `@clickhouse/client` — a stable shape, no
dependency, [Tier 0](../../../../docs/opinions/dependencies.md); pooling later is a one-class change.

- **Parameters bind server-side** (`{name:Type}` from `param_*` entries) — every tenant shares one table,
  so interpolation would be a cross-tenant read.

- **Arrays are literals and need escaping** — an unescaped `'` split one element into two, silently
  widening a filter. `escape()` does `\` first, then `'` (the reverse escapes its own escape).
- **Table names are qualified** against the configured database (else `default`, the `0000` trap).
- **`DateTime64(3)` is `YYYY-MM-DD HH:MM:SS.mmm`** — ISO's `T`/`Z` is a loud 400.
- **Response bodies are logged, never thrown** — to `dependency.request.failed` at warn (500 characters);
  callers get `UnavailableError("clickhouse", status)`, since a failed `INSERT` body echoes the row and
  `toJSON()` reaches clients.

---

## Two adapters: one writes, and one only reads

`ClickHouseAnalyticsProjector` writes, from worker schedules only; `ClickHouseAnalyticsReader` reads, on
the request path (`23.14`). `/analytics` shows a tenant activity per day and action over 30 or 90 days:
`GetActivityTrendUseCase` asserts `analytics.activity.read` (`owner`, `admin`) and passes the principal's
tenant. The reader port (`application/src/analytics/`) has no write method, takes the tenant resolved,
uses ISO UTC days, and **reads `FINAL`** — an unmerged redelivery would otherwise count twice
(`analytics-reader.smoke.spec.ts`). Without ClickHouse it answers `configured: false`. No driver flag until
a second implementation (an earlier unused reader pair and `ANALYTICS_DRIVER` were deleted).

**Separate classes are the first guard:** one class would put `project()` on a dashboard's object —
*nothing writes here but the projection*, no use-case writes, no non-replay backfills.

---

## The projection, and why it reads its own checkpoint

Two tables are projected: `activity_events` from `activity_log`, drawn below, and
`ai_usage_events` from `ai_usage`, built the same way by `ClickHouseAssistantUsageProjector`. The
second has its own reader, `ClickHouseAssistantUsageReader`, for the platform's AI usage report.

```
activity_log ──► PgActivityReplayReader ──► ClickHouseAnalyticsProjector ──► activity_events
  (Postgres,          keyset on                ReplacingMergeTree               (derived)
   authoritative)     (occurred_at, id)        keyed on id
```

`checkpoint()` reads `max(occurred_at)` and its id **from the destination** — a cursor stored elsewhere can
silently disagree with what landed.

- **Keyset `(occurred_at, id)`** — same-microsecond rows would be dropped (`>`) or replayed forever (`>=`).
- **An empty table answers 1970, not null** — the projector checks, or a first run skips everything.
- **Idempotent** — `ReplacingMergeTree` sorted ending in `id`; `dailyCounts` reads `FINAL` so unmerged
  duplicates raise no false alarm.
- **5,000 rows a batch, 20 batches a run** — few large parts for the merge; the cap bounds a post-outage
  run's Postgres connection.

---

## Reconciliation, the second guard

The realistic failure is a consumer that died quietly on a Tuesday, noticed a quarter later.
`reconcile()` diffs per-day counts from both stores over a week — **neither reaches into the other**.

- **Today is excluded** (timing, not drift).
- **Excluded actions are subtracted on both sides**, read once per run into `since` and both
  `dailyCounts` — one-sided, they would drift forever. `since` filters **in the query** (a page of
  excluded rows would look caught up); ClickHouse binds `{excluding:Array(String)}` (`NOT IN []` is true),
  Postgres omits the predicate (drizzle's `not inArray(col, [])` matches nothing).
- **Drift is one `analytics.reconciliation.drifted` at `error` per day** — the replay grain, with a
  deadline while `activity_log` covers it.
- **The cold half** (`reconcileCold`): per archived month, `partition_archive.row_count` minus excluded
  `action_counts` against this store's monthly sum — one query per tenant over the whole range, skipping
  null-`projected_at` months (known gaps). Lines carry `source: "hot" | "cold"`; cold months replay from
  S3 (`cold/activity_log/<yyyy>/<mm>/<organization_id>.ndjson.gz`, one object per tenant-month) via the
  Gaps panel ([cold storage](cold-storage.md)).

---

## The TTL is one expression, and two things about it are not obvious

`RetentionRules.clickhouseTtlFor(defaultMonths, perAction)` composes one
`toDateTime(occurred_at) + toIntervalMonth(n) WHERE action = '…'` per action, then the default with
`WHERE action NOT IN (…)`, sorted for a stable string (else a nightly rewrite).

- **The `NOT IN` is load-bearing** — an unguarded default also matches longer-kept actions, and the
  earliest expiry wins (a 120-month `role.created` would die at 12). `tests/smoke/analytics.smoke.spec.ts`
  proves it: insert, force a merge, count, three times.
- **No `DELETE` keyword** — ClickHouse strips it on echo, so the comparison would always differ and
  re-materialise every part nightly (the same reason for spelling `toIntervalMonth`).

---

## One ClickHouse for the deployment, and no `shard` column

The loop places **each tenant** on its node, so the checkpoint is per tenant (`projection_checkpoint`,
keyed by organization) and survives a move; a `shard` column would record stale topology
([sharding](sharding.md)).

## Adopting it, in the supported order

```bash
pnpm infra up analytics          # starts the container; nothing writes to it yet
```

1. **Set `CLICKHOUSE_URL`** — the projector and reader are built, and the worker registers
   `analytics-projection` (every five minutes) and `analytics-reconcile` (nightly). `/analytics` shows
   what has been projected so far.
2. **Watch `analytics.reconciliation.completed` come back clean** for a few days, with a non-growing
   `lagSeconds` on `analytics.projection.completed`, before trusting the screen's history.

**Not started by `pnpm infra up`** — a running store with no consumer looks like a decision.

---

## What is not wired, and is not meant to be

**The policy and one reader are wired** (`23.14`): `projection_policy` decides which actions arrive and
for how long (edited on screen, honoured by reconciliation, converged into the TTL); the reader answers
activity over time only. The policy came first because an exclusion's gap becomes unfillable once the
audit window passes; a reader has no deadline. **No rollups** — two never-written rollup tables, their
adapters and a driver flag were deleted ([Simplicity](../../../../docs/opinions/simplicity.md)). **No
materialized views** — a KPI computed only here is authoritative, the move
[Data and scale](../../../../docs/opinions/data-and-scale.md) forbids.

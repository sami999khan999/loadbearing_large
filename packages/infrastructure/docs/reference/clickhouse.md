---
title: ClickHouse
description: The derived analytics store — two adapters, one connection, and the two guards that keep it rebuildable rather than authoritative.
---

# ClickHouse

The only store in this repository that is allowed to be wrong. Everything in it is a replay of
`activity_log`: drop the whole database, run the projection from an empty checkpoint, and the rows
come back.

**That property is the entire design.** It is what makes adopting ClickHouse a performance decision
rather than a correctness one, and it survives exactly as long as the two guards below hold.

| | |
| --- | --- |
| **Folder** | `packages/infrastructure/src/clickhouse/` |
| **Ports** | `AnalyticsReader` (read), `AnalyticsProjector` (write) |
| **Config** | `analytics.clickhouse` on `ContainerConfig`; `CLICKHOUSE_*` in the environment |
| **Container** | `container.analytics`, `container.projector`, `container.hasProjector` |
| **Compose** | `--profile analytics`, stopped by default |
| **Dependency** | none — `fetch` against the HTTP interface |

---

## No client library

`ClickHouseConnection` is `fetch` over ClickHouse's HTTP interface, not `@clickhouse/client`. Same
call `OpenAiEmbeddingProvider` makes, for the same reasons: the request shape is stable, the
dependency count stays where it is, and ClickHouse stays a
[Tier 0](../../../../docs/opinions/dependencies.md) dependency reached over a protocol this runtime
already speaks. Wanting the SDK's connection pooling later is a change inside one class.

Three things it does that are easy to get wrong by hand:

**Parameters are bound server-side, never interpolated.** ClickHouse reads `{name:Type}` placeholders
out of `param_*` query-string entries. The analytics store holds every tenant's rows in one table, so
an injected predicate here is a cross-tenant read — this is the one place in the package where string
interpolation into SQL would be a security bug rather than a style one.

**Table names are qualified against the configured database on the way out.** ClickHouse resolves an
unqualified name against the session default, which is `default` unless every request says otherwise.
That is the same trap `clickhouse.init.sql` documents at the top, and the reason a table can look
missing while it exists.

**`DateTime64(3)` is `YYYY-MM-DD HH:MM:SS.mmm`.** An ISO string's `T` and `Z` are rejected. That
failure is at least loud — a 400 with a parse error — unlike the alternative of a silently wrong hour.

**The response body is logged, never thrown.** The status is usually a bare 500 and the body is the
whole message — so the body goes to `dependency.request.failed` at **warn**, truncated at 500
characters, and the caller gets `UnavailableError("clickhouse", status)`. It cannot be carried on the
error: `AppError.toJSON()` serialises `ErrorContext` to the client, and a failed `INSERT` echoes the
offending row.

---

## Two adapters, not one

`ClickHouseAnalyticsReader` answers the two dashboard questions and is reachable from a request path.
`ClickHouseAnalyticsProjector` writes, and is reachable only from the worker's schedules.

**A single class with both would put `project()` on the object a dashboard query holds.** The split is
the first guard: *nothing writes to ClickHouse except the projection consumer* — no direct writes from
use-cases, no hand-run backfills that are not replays.

The reader is a straight parallel to `PgAnalyticsReader`, down to the awkward part:
`goalRiskScores(goalIds)` carries no tenant, so `organization_id` is unavailable as a leading sorting
key and `goal_risk_daily` is ordered on `(goal_id, period, organization_id)` instead. Postgres solves
the same problem with `goal_risk_daily_goal_idx`. One port, one pair of questions, two stores — a
driver flip changes where the answer comes from, never what it is.

> [!WARNING]
> **`reliabilityTrend` recomputes from the stored components and never averages the stored ratios.**
> The mean of per-goal ratios is not the ratio across goals. This is the implementation where that is
> easiest to get wrong, because a column store makes `avg(score)` look like the obvious query.

---

## The projection, and why it reads its own checkpoint

```
activity_log ──► PgActivityReplayReader ──► ClickHouseAnalyticsProjector ──► activity_events
  (Postgres,          keyset on                ReplacingMergeTree               (derived)
   authoritative)     (occurred_at, id)        keyed on id
```

`checkpoint()` reads `max(occurred_at)` and the id that carries it **out of the destination table**,
not out of a cursor kept beside it.

A checkpoint stored in Postgres or Redis can disagree with what actually landed — the batch that was
acknowledged and then failed to insert — and the disagreement is silent. Asking the table what its own
last row is cannot be wrong in that direction.

Two details that are load-bearing:

**The keyset is `(occurred_at, id)`, not `occurred_at` alone.** Two audit rows can share a
microsecond. A cursor carrying only a timestamp either drops the second row (`>`) or replays the first
forever (`>=`); the tuple comparison does neither.

**An empty table answers with ClickHouse's zero value, not null.** That is 1970, and taken literally
it would make a first run resume *after* every row ever written. The projector checks for it.

`project()` is idempotent because `activity_events` is a `ReplacingMergeTree` whose sorting key ends
in `id`. BullMQ redelivers, so this is not optional — and `dailyCounts` reads with `FINAL` so a
duplicate that has not merged yet is not counted twice. A reconciliation that reports drift because of
an unmerged part is a false alarm, and a false alarm on this check is how a real one stops being read.

**Batches are large and the run is capped.** 5,000 rows per round trip, 20 batches per run: ClickHouse
merges on write, so a thousand single-row inserts create a thousand parts the background merge never
catches up with. The per-run cap bounds how long one job holds a Postgres connection — the first run
after a long outage stops, and the next tick resumes from the checkpoint.

---

## Reconciliation, the second guard

The realistic failure is not an outage. It is a consumer that died quietly on a Tuesday and was
noticed a quarter later, when a report looked wrong.

`AnalyticsConsumer.reconcile()` runs nightly, asks both stores for row counts per day over the last
week, and diffs them. Neither store reaches into the other: each answers the same question in the same
shape and the consumer compares the answers, which is what keeps both adapters single-store.

**Today is excluded from the window.** It is still being written to, so a difference in it is timing
rather than drift, and a check that cries wolf daily is a check nobody reads.

Drift emits `analytics.reconciliation.drifted` at **error**, one line per day rather than one line
listing them — a log field is something you filter and alert on, never a structure you read, and the
day is the grain an operator picks a replay window from. It is `error` and not `warn` because every
number a dashboard has shown since the first drifting day is wrong, and the fix is a replay, which
only works while `activity_log` still covers the window. **The alert has a deadline attached.**

Past that window the replay source is `activity_archive` and the objects
[`PgActivityArchiveGateway`](../../../application/docs/index.md) wrote to S3, which is why that
gateway exists at all.

---

## Adopting it, in the supported order

```bash
pnpm infra:up:analytics          # starts the container; nothing writes to it yet
```

1. **Set `CLICKHOUSE_URL`.** The container builds a projector, the worker registers
   `analytics-projection` (every five minutes) and `analytics-reconcile` (nightly), and the store
   starts filling. `ANALYTICS_DRIVER` is still `postgres`, so no dashboard has moved.
2. **Watch `analytics.reconciliation.completed` come back clean for a few days**, and
   `analytics.projection.completed` report a `lagSeconds` that is not growing.
3. **Flip `ANALYTICS_DRIVER=clickhouse`.** One variable, one process restart, no call site touched.

Doing it in one step cuts reads over to a store that is still filling. The two-variable arrangement
exists to make the wrong order hard to reach by accident.

**Not started by `pnpm infra:up`.** The seam exists, the container exists, and until step 1 nothing
writes to it — a running analytics store with no consumer looks like a decision somebody made.

> [!IMPORTANT]
> `ANALYTICS_DRIVER=clickhouse` with no `CLICKHOUSE_URL` throws at container construction. The
> alternative is a silent fall back to Postgres: the dashboard keeps answering, out of the store the
> operator believed they had moved off.

---

## What is not wired, and is not meant to be

`goal_risk_daily` and `user_reliability_daily` exist in ClickHouse and in Postgres, with the same
columns and the same grain. **Neither is written yet, in either store** — the rollup job is move #2 in
[Data and scale](../../../../docs/opinions/data-and-scale.md), and it is deliberately not built in
advance.

The tables are here so adopting ClickHouse is not also a schema exercise, and so the two
`AnalyticsReader` implementations stay honestly interchangeable: both answer from rollups, and both
answer nothing until the rollups are filled. An implementation that quietly returned real data while
its counterpart returned none would make the driver flip a behaviour change rather than a swap.

A materialized view computing those rollups inside ClickHouse would work and is the obvious
shortcut. It is also the exact move
[Data and scale](../../../../docs/opinions/data-and-scale.md) names as the way this store stops being
derived — a KPI computed there and stored nowhere else is authoritative, the rebuild story is gone,
and nobody decided it.

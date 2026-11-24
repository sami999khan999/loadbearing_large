---
title: clickhouse.init.sql
description: The analytics store that is defined and deliberately not running — the schema, every clause in it, and the trigger that would start it.
---

# `clickhouse`

Behind the `analytics` profile and **not** started by `pnpm infra up` — a decision, not an oversight.

| | |
| --- | --- |
| **Image** | `clickhouse/clickhouse-server:24.12-alpine` |
| **Inside the network** | `clickhouse:8123` (HTTP), `clickhouse:9000` (native) |
| **From the host** | `localhost:18123`, `localhost:19002` |
| **Credentials** | `ratchet` / `ratchet`, database `ratchet` |
| **Volume** | `clickhousedata` |
| **Config file** | `clickhouse.init.sql` |

**The native port maps to 9002** because MinIO owns 9000; a collision gives a container that starts,
binds nothing useful, and fails at connect with an error naming neither service.

---

## Why it exists and why it is stopped

[Data and scale](../../opinions/data-and-scale.md) commits to ClickHouse eventually, and its
five-thousand-employee topology has none. **Nothing reads an analytics store today** — half a million
rows a year is an indexed Postgres table. An `AnalyticsReader` port once existed over both stores;
nothing called it and it was deleted.

**The write side is finished; the deployment side is off.** `ClickHouseAnalyticsProjector`, the
projection consumer and the nightly reconciliation exist and are smoke-checked
([package reference](../../../packages/infrastructure/docs/reference/clickhouse.md)). This container
and the variables reaching it are off — *the seam implemented* and *the store started* are separate
decisions.

> **A running analytics store with nothing writing to it looks like a decision somebody made.** The
> next person assumes it is load-bearing, and the rebuild story quietly stops being true.

So `CLICKHOUSE_URL` is unset in `.env.example`. `pnpm infra up analytics` starts the container; that
variable *feeds* it. **The trigger:** snapshots stop covering ad-hoc queries — not size, not speed.

---

## Starting and stopping it

```bash
pnpm infra up analytics
docker compose -f infra/docker-compose.yml --profile analytics stop clickhouse
```

`pnpm infra down` and `infra reset` pass `--profile "*"` and reach it; a plain `docker compose down`
does not, leaving a container nobody remembers starting.

---

## `clickhouse.init.sql`

```sql
CREATE TABLE IF NOT EXISTS ratchet.activity_events
(
  id              UUID,
  organization_id UUID,
  occurred_at     DateTime64(3),
  actor_id        UUID,
  action          LowCardinality(String),
  subject_id      Nullable(UUID),
  payload         String
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, occurred_at, id)
TTL toDateTime(occurred_at) + INTERVAL 5 YEAR;
```

Mounted at `/docker-entrypoint-initdb.d/01-schema.sql`; the only table. Two rollup tables mirroring a
Postgres pair once sat beside it, empty in both stores behind an uncalled port, and all four were
dropped.

- **`ratchet.` is qualified on purpose.** The entrypoint runs scripts against **`default`**, not
  `CLICKHOUSE_DB`, so an unqualified `CREATE TABLE` lands in the wrong database (it happened here).
- **`ENGINE = ReplacingMergeTree`.** The `MergeTree` family is what supports partitioning, sorting
  keys and TTL (`Log` or `Memory` would accept the columns and none of the behaviour). **`Replacing`
  makes the projection idempotent:** rows sharing a sorting key collapse at merge, and the key ends in
  the `activity_log` id, so a batch BullMQ redelivers overwrites rather than doubles. A plain
  `MergeTree` would silently double-count a day after a partial retry, and reconciliation would report
  drift the projection caused.

  > [!IMPORTANT]
  > **Deduplication happens at merge time, not insert.** A `SELECT` before parts merge sees both
  > copies, so every counting query uses `FINAL` — otherwise reconciliation reports self-resolving
  > drift, and false alarms are how a real one stops being read.

- **`id`, first column** — the `activity_log` primary key, ending the dedup key and read back by
  `AnalyticsProjector.checkpoint()` to resume a replay. The cursor lives in the destination table
  because one kept elsewhere can disagree with what landed.
- **`PARTITION BY toYYYYMM(occurred_at)`** — one partition a month, so dropping old data is metadata
  and a date-range query reads only its months; Postgres's `activity_log` reasoning, done natively.
- **`ORDER BY (organization_id, occurred_at, id)`** — the sorting key is the primary (sparse) index
  *and*, under `ReplacingMergeTree`, the dedup key. **It leads with the tenant** for the same reason
  every Postgres index does; `occurred_at` second because every question is a time range; `id` last to
  make the tuple unique (stopping at `occurred_at` would merge two rows from the same millisecond).
  `action` once sat second and was removed: in the dedup key, correcting a mislabelled row would add a
  row instead of replacing it. Reordering changes physical layout and dedup and needs a rewrite.
- **`LowCardinality(String)` on `action`** — a dictionary over a closed vocabulary (`task.reactivated`,
  `rbac.role.granted`), cheap to store and filter. The Loki label argument one layer down: on
  `actor_id` it would make things worse.
- **`TTL … INTERVAL 5 YEAR`** — dropped a partition at a time. Five years against Postgres's 12–24
  months *is* the reason the store exists: detail for operators there, trends for the business here.
- **`payload String`** — JSON as text, so the store is not coupled to today's payload shape and stays
  droppable and rebuildable.

**Init scripts run only on an empty data directory**; editing and restarting does nothing:

```bash
docker volume rm ratchet_clickhousedata     # then start again
```

---

## The two guards that keep it derived

Both are implemented (they were not when this page was first written):

- **Only the projection writes.** `ClickHouseAnalyticsProjector` is the only inserting class, reachable
  only from the worker; no request path reaches ClickHouse. No direct use-case writes, no backfills
  that are not replays.
- **A daily reconciliation** — `analytics-reconcile` at 05:00 over the last seven days — comparing
  per-day counts with the activity log. The realistic failure is a consumer dead since Tuesday and a
  wrong quarterly report in March.

Mechanics are in the [package reference](../../../packages/infrastructure/docs/reference/clickhouse.md).
**It stops being derived** with a KPI computed in a materialized view and stored nowhere else — a live
temptation, since a materialized view over `activity_events` is an afternoon's work and the first
dashboard to want one will not ask where it rebuilds from.

---

## Checking it

```bash
curl -s http://localhost:18123/ping

curl -s "http://localhost:18123/?user=ratchet&password=ratchet" \
  --data-binary "SELECT database, name, engine FROM system.tables WHERE name = 'activity_events' FORMAT TSV"

curl -s "http://localhost:18123/?user=ratchet&password=ratchet" \
  --data-binary "SELECT partition_key, sorting_key FROM system.tables WHERE database = 'ratchet' AND name = 'activity_events' FORMAT TSV"
```

The database must be **`ratchet`** (if `default`, the script predates qualification — drop the volume)
and the engine **`ReplacingMergeTree`** (a plain `MergeTree` predates the projection and will
double-count on redelivery). End to end: `pnpm --filter @loadbearing/infrastructure run smoke` with
`CLICKHOUSE_URL` set inserts a row twice and expects one back.

> **The healthcheck uses `127.0.0.1`, not `localhost`** — ClickHouse listens on IPv4 only and busybox
> `wget` resolves `localhost` to `::1` first, so it would never report healthy.

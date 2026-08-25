---
title: clickhouse.init.sql
description: The analytics store that is defined and deliberately not running — the schema, every clause in it, and the trigger that would start it.
---

# `clickhouse`

Behind the `analytics` profile, and **not** started by `pnpm infra:up`. That is a decision rather
than an oversight.

| | |
| --- | --- |
| **Image** | `clickhouse/clickhouse-server:24.12-alpine` |
| **Inside the network** | `clickhouse:8123` (HTTP), `clickhouse:9000` (native) |
| **From the host** | `localhost:8123`, `localhost:9002` |
| **Credentials** | `ratchet` / `ratchet`, database `ratchet` |
| **Volume** | `clickhousedata` |
| **Config file** | `clickhouse.init.sql` |

**The native port maps to 9002 on the host** because MinIO owns 9000. A collision there produces a
container that starts, binds nothing useful, and fails at connect time with an error naming neither
service.

---

## Why it exists and why it is stopped

[Data and scale](../../../docs/opinions/data-and-scale.md) commits to ClickHouse eventually and is
explicit about when: *"do not do this week."* Its five-thousand-employee topology has no ClickHouse
in it at all.

**Today, `AnalyticsReader` is the port and `PgAnalyticsReader` is the implementation**, reading
snapshot tables in Postgres. Half a million rows a year is a Postgres table with a good index.

Defining the container means adopting ClickHouse later is `--profile analytics` and a consumer,
rather than an infrastructure project scheduled during the week a dashboard got slow. Leaving it
*running* would be worse than not having it:

> **A running analytics store with nothing writing to it looks like a decision somebody made.** The
> next person assumes it is load-bearing, and the rebuild story quietly stops being true.

**The trigger is specific:** snapshots stop covering ad-hoc queries. Not "the table is large", not
"ClickHouse would be faster" — the moment the questions being asked are ones no precomputed rollup
answers.

---

## Starting and stopping it

```bash
pnpm infra:up:analytics
docker compose -f infra/docker-compose.yml --profile analytics stop clickhouse
```

`pnpm infra:down` and `infra:reset` pass `--profile "*"` so they do reach it. A plain
`docker compose down` does not — Compose only acts on profiles it was given, and ClickHouse survives
as a container nobody remembers starting.

---

## `clickhouse.init.sql`

```sql
CREATE TABLE IF NOT EXISTS ratchet.activity_events
(
  organization_id UUID,
  occurred_at     DateTime64(3),
  actor_id        String,
  action          LowCardinality(String),
  subject_id      Nullable(UUID),
  payload         String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, action, occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 5 YEAR;
```

Mounted at `/docker-entrypoint-initdb.d/01-schema.sql`.

### `ratchet.` is qualified on purpose

ClickHouse's entrypoint runs the scripts in that directory against **`default`**, not against
`CLICKHOUSE_DB`. An unqualified `CREATE TABLE` therefore succeeds in the wrong database and the table
looks missing — verified by it happening here.

### `ENGINE = MergeTree`

ClickHouse's table engines are not interchangeable the way a storage engine usually is. `MergeTree`
is the family that supports partitioning, sorting keys and TTL — the three clauses below all require
it. `Log` or `Memory` would accept the columns and none of the behaviour.

### `PARTITION BY toYYYYMM(occurred_at)`

One partition per month. **Dropping old data becomes a metadata operation** rather than a scan, and a
query with a date range reads only the partitions it needs.

This is the same reasoning as the monthly partitioning on Postgres's `activity_log`
([13](../../../docs/setup/13-db-package.md)) — the difference is that ClickHouse does it natively
rather than needing hand-written DDL.

### `ORDER BY (organization_id, action, occurred_at)`

**The sorting key, and in `MergeTree` it is also the primary index.** Data is stored physically in
this order, and ClickHouse keeps a sparse index over it — so a query whose predicate matches the
leading columns reads a fraction of the data.

**It leads with `organization_id` for the same reason every Postgres index does:** it is the tenant
boundary, and an analytics store that cannot cheaply answer a question for one organization is not
useful. `action` second, because filtering by activity type is the next most common narrowing;
`occurred_at` last, since the partition has usually already narrowed time.

Reordering these is not a tuning tweak — it changes physical layout and requires a rewrite.

### `LowCardinality(String)` on `action`

Stores the column as a dictionary of distinct values plus an index into it. `action` is a closed
vocabulary — `task.reactivated`, `rbac.role.granted` — so the dictionary is small and both storage
and filtering get much cheaper.

**The same cardinality argument as the Loki label set, one layer down.** Applying it to a
high-cardinality column such as `actor_id` would make things worse, which is why only `action` has it.

### `TTL ... INTERVAL 5 YEAR`

Rows expire after five years, dropped a whole partition at a time.

**Five years here against Postgres's twelve-to-twenty-four months *is* the reason the store exists.**
Postgres keeps detail for as long as an operator needs to read a row; the column store keeps
aggregates for as long as the business needs a trend.

### `payload String`

JSON as text rather than a typed column. ClickHouse has JSON handling, and committing to a shape here
would couple the analytics store to whatever the activity payload looks like today — the opposite of
a store that can be dropped and rebuilt.

---

## Init scripts run exactly once

Like Postgres, scripts in `/docker-entrypoint-initdb.d` run **only when the data directory is empty**.
Editing this file and restarting does nothing.

```bash
docker volume rm ratchet_clickhousedata     # then start again
```

---

## The two guards that keep it derived

Purely derived is what makes ClickHouse a performance decision rather than a correctness one. It stays
that way only if both hold:

- **Nothing writes to it except the event consumer.** No direct writes from use-cases, no manual
  backfills that are not replays.
- **A daily reconciliation job** comparing row counts per day against the activity log. The realistic
  failure is not an outage — it is a consumer that died quietly on a Tuesday and a quarterly report
  that looks wrong in March.

**The way it stops being derived:** a KPI computed in a materialized view and stored nowhere else. At
that point it is authoritative, the rebuild story is gone, and nobody decided it.

---

## Checking it

```bash
curl -s http://localhost:8123/ping

curl -s "http://localhost:8123/?user=ratchet&password=ratchet" \
  --data-binary "SELECT database, name, engine FROM system.tables WHERE name = 'activity_events' FORMAT TSV"

curl -s "http://localhost:8123/?user=ratchet&password=ratchet" \
  --data-binary "SELECT partition_key, sorting_key FROM system.tables WHERE database = 'ratchet' AND name = 'activity_events' FORMAT TSV"
```

The database must be **`ratchet`**, not `default`. If it is `default`, the init script ran before the
qualification was added — drop the volume and start again.

> **The healthcheck uses `127.0.0.1`, not `localhost`.** ClickHouse listens on IPv4 only while busybox
> `wget` resolves `localhost` to `::1` first, so the `localhost` form is refused from inside the
> container and the service never reports healthy.

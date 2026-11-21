---
title: docker-compose.yml
description: Fifteen services, five profiles, eight volumes and one network — what every block does and which parts are load-bearing.
---

# `docker-compose.yml`

The only file here Docker reads directly; it mounts everything else.

```yaml
name: ratchet
```

**The project name appears in two places.** It prefixes every container (`ratchet-loki-1`), volume
(`ratchet_pgdata`) and the network (`ratchet_default`), and [`alloy.config.alloy`](alloy.md) filters
on it to choose containers. Change one without the other and Alloy silently collects nothing.

---

## The network

No `networks:` block, deliberately: Compose creates the bridge `ratchet_default` and joins every
service. **A service name is a hostname** — Docker's embedded DNS at `127.0.0.11` resolves `loki`,
which is why `alloy.config.alloy` says `http://loki:3100` and `loki.config.yml` says
`endpoint: minio:9000`. Explicit networks would buy segmentation (Alloy off the database): worth it in
production, theatre on one laptop.

---

## Services

### The four stores

| Service | Image | Notes |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | [postgres](postgres.md) |
| `redis-cache` | `redis:7-alpine` | evicts, no persistence — [redis](redis.md) |
| `redis-queue` | `redis:7-alpine` | never evicts, always persists — [redis](redis.md) |
| `minio` | `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` | S3 stand-in — [minio](minio.md) |

**`minio-init` is a one-shot:** an `mc` image waits for the MinIO API, creates both buckets and exits.
`exited (0)` is success, and `compose-wait.mjs` holds the stack un-ready until then. It has
`restart: "no"` (or the project default would restart a container whose job is to finish) and no
healthcheck (a container meant to stop cannot be "unhealthy").

**It sets no CORS rule.** This MinIO has no per-bucket CORS API — `mc cors set` is refused as "not
implemented" — and answers every origin. Production S3 or R2 needs a rule allowing `POST` from the
app's origin, or browser uploads fail: [the bucket's CORS rule](../deployment.md#the-buckets-cors-rule).

### Observability, profile `observability`

| Service | Image | Notes |
|---|---|---|
| `loki` | `grafana/loki:3.3.2` | [loki](loki.md) |
| `alloy` | `grafana/alloy:v1.5.1` | [alloy](alloy.md) |

#### Why there is no log UI

This profile collects and stores; nothing reads back. Grafana was removed deliberately: a log console
and the super admin dashboard are the same job for the same person, and the query an operator needs —
*these logs, for this tenant, joined to its audit rows* — needs a concept of organization Grafana
lacks (the dashboard also absorbed Grafana's ad-hoc Postgres surface). **Until the dashboard ships
there is no log viewer**: use `docker compose logs -f <service>` or curl against `query_range`
([loki](loki.md)), which stay the break-glass path when the app is down.

### Analytics, profile `analytics`

`clickhouse`, deliberately not started. See [clickhouse](clickhouse.md).

### The second node, profile `sharded`

`postgres-shard-1` and `pgbouncer-shard-1`, not started by default. Same image and
`postgres.init.sql`, own volume (sharing the catalog's data directory would rehearse nothing).
`pnpm infra:up:sharded` starts them; two commented `.env.example` lines point `DATABASE_SHARD_1_URL`
at `:6433` and its direct counterpart at `:5433`. No range or key config: `shard_assignments` on the
catalog names each tenant's node, so a node is two URLs —
[sharding](../../../packages/infrastructure/docs/reference/sharding.md).

### Node 0's standby, profile `replica`

`postgres-replica`, a streaming hot standby of `postgres`, started by `pnpm infra:up:replica`;
`DATABASE_REPLICA_URL` points at `:15434`. No pooler: nothing writes to it, and its readers are the
worker's batch reads.

- **It clones itself on an empty volume**: with no `PG_VERSION` in `$PGDATA` the entrypoint runs
  `pg_basebackup -R`, which writes `standby.signal` and the connection string, so the image then
  starts a standby instead of `initdb`. To re-clone, remove `pgreplicadata` and start it.
- **A standby left stopped falls behind for good.** With no replication slot the primary recycles WAL
  it needs, and it logs `requested WAL segment … has already been removed` every five seconds while
  still accepting connections. Its healthcheck asks `pg_stat_wal_receiver` for `streaming`, so this
  shows unhealthy; re-clone.
- **The primary needed one line:** the image's `pg_hba.conf` allows replication from localhost only,
  so `infra/pg_hba.conf` restates it plus `host replication all all scram-sha-256`, mounted via
  `hba_file` (so existing volumes get it too).
- **It carries the primary's settings** — a hot standby refuses a lower `max_connections` or
  `max_locks_per_transaction`.

Which reads use it, and why a read never sees less than the primary had:
[sharding](../../../packages/infrastructure/docs/reference/sharding.md#read-replicas).

### The colder tier, profile `cold-tier`

`minio-cold` and `minio-cold-init`, for `25.3`. **MinIO has no storage classes**: a lifecycle
transition names a *remote tier*, another object store. So the rehearsal is a second MinIO;
`minio-cold-init` creates its `tier` bucket and registers it on `minio` as `COLD`, the value
`S3_COLD_STORAGE_CLASS` names. **Check with `tier ls | grep`, never `tier info`** — `mc ilm tier info`
exits 0 for a missing tier, and the first version printed "cold tier ready" over a bucket with none.
No published port: the app writes a rule naming `COLD` and MinIO moves objects. See
[storage policy](../../../packages/infrastructure/docs/reference/storage-policy.md).

---

## Profiles

A service without `profiles:` always runs; one with it runs only when selected.

```bash
docker compose ... up -d                                  # 5 services
docker compose ... --profile observability up -d          # 8
docker compose ... --profile observability --profile analytics up -d   # 9
docker compose ... --profile observability --profile sharded up -d     # 10
docker compose ... --profile observability --profile replica up -d     # 9
docker compose ... --profile observability --profile cold-tier up -d   # 10
```

The `pnpm infra:*` scripts wrap these, `observability` on by default.

> **`--profile "*"` on `down`, `reset` and `logs` is load-bearing.** Compose acts only on the profiles
> it was given; without it `down` leaves profiled services running and `logs -f` silently omits them.

---

## Volumes

| Volume | Service | Rebuildable from |
|---|---|---|
| `pgdata` | postgres | migrations + seeds |
| `pgshard1data` | postgres-shard-1 | migrations + the tenants the directory places there |
| `pgreplicadata` | postgres-replica | the primary — it is a copy, re-cloned on an empty volume |
| `redisqueuedata` | redis-queue | **nothing** |
| `miniodata` | minio | uploads are a second source of truth; Loki chunks are not |
| `miniocolddata` | minio-cold | **nothing** — a transitioned object lives only here |
| `lokidata` | loki | index only — chunks live in MinIO |
| `clickhousedata` | clickhouse | replaying the activity log |

**`redis-cache` has no volume on purpose** — one would invite treating it as durable. `pnpm
infra:reset` destroys all eight, fine locally; anywhere with real pending work, clearing the cache and
clearing the queue are different operations, which the two-instance split makes possible.

### Bind mounts

Every config file is mounted individually, read-only:

```yaml
- ./loki.config.yml:/etc/loki/config.yml:ro
- ./postgres.init.sql:/docker-entrypoint-initdb.d/01-extensions.sql:ro
- ./pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
```

Docker creates missing parent directories, so a file can land in a path the image never had — which
removed the old directory-per-service layout. Two mounts must be directories:

```yaml
- ./logs:/var/log/app:ro              # Alloy globs *.log — a file mount cannot match a glob
- /var/run/docker.sock:/var/run/docker.sock:ro
```

**The socket needs a group too.** It is `root:docker` on Linux and Alloy is not root, so
`group_add: ["${DOCKER_GID:-999}"]` makes it readable; without it Alloy is healthy and collects
nothing. Docker Desktop's default is usually right; on Linux use `getent group docker`.

> **A single-file mount does not survive an editor that replaces the file** (new inode; the container
> keeps the old one). Restart the service after editing — every config is read at startup anyway.

---

## Host ports

Every host port is a variable with a documented default; container ports are fixed:

```yaml
ports: ["${MINIO_CONSOLE_PORT:-9001}:9001"]
```

Collisions are real — `9001` was taken on the first run, and later five ports at once against two
other projects. So each published port is the well-known one with a `1` in front, readable as its
service and leaving `2xxxx` for the next stack.

**They live in the root `.env`, the only env file.** With `-f infra/docker-compose.yml` Compose's
project directory is `infra/`, so it once read `infra/.env` and the stack and apps disagreed about
where Postgres was. `pnpm infra:up` now goes through `tooling/scripts/compose.mjs`, which passes
`--env-file <root>/.env` only when it exists (the flag errors on a missing file, there is no
`-if-exists`, and CI has no `.env`).

| Variable | Default | Variable | Default |
|---|---|---|---|
| `POSTGRES_PORT` | 15432 | `LOKI_PORT` | 13100 |
| `PGBOUNCER_PORT` | 16432 | `ALLOY_PORT` | 12345 |
| `REDIS_CACHE_PORT` | 16379 | `MAILPIT_UI_PORT` | 18025 |
| `REDIS_QUEUE_PORT` | 16380 | `SMTP_PORT` | 11025 |
| `S3_PORT` | 19000 | `CLICKHOUSE_HTTP_PORT` | 18123 |
| `MINIO_CONSOLE_PORT` | 19001 | `CLICKHOUSE_NATIVE_PORT` | 19002 |
| `POSTGRES_SHARD_1_PORT` | 15433 | `PGBOUNCER_SHARD_1_PORT` | 16433 |
| `POSTGRES_REPLICA_PORT` | 15434 | | |

A checkout with no `.env` (which CI is) gets these defaults, so `check:architecture` §27 asserts each
equals `.env.example`, and pairs each `*_PORT` with the URL that dials it (`POSTGRES_PORT` ↔
`DATABASE_DIRECT_URL`, `PGBOUNCER_PORT` ↔ `DATABASE_URL`). `MINIO_CONSOLE_PORT`, `MAILPIT_UI_PORT`,
`ALLOY_PORT` and `CLICKHOUSE_NATIVE_PORT` have no counterpart — you dial them, the app does not.

**Overriding one changes nothing inside the network** — only the left side moves; Alloy still says
`loki:3100`. ClickHouse's native port is `19002`, not `19000`, to avoid MinIO; `ALLOY_PORT` keeps
`12345`, already clear.

---

## Healthchecks and `depends_on`

`depends_on` alone waits for a *start*, not usability, so every long-running service but MinIO has a
healthcheck:

```yaml
depends_on:
  minio-init: { condition: service_completed_successfully }
  loki:       { condition: service_healthy }
```

- **MinIO has no probe**, after two that could not run: `mc ready local` needed a binary the server
  image lacks and an alias `minio-init` creates (while waiting on that check); `curl -sf
  /minio/health/live` died when the community rebuild replacing the withdrawn `minio/minio` shipped no
  `curl`. Now `minio-init` retries `mc alias set` until the API answers — a real readiness check
  needing only the chosen `mc` — and `compose-wait.mjs` passes `minio` on `running` alone.
- **Alloy** probes with `bash`'s `/dev/tcp` (no `wget` or `curl` in the image). It proves Alloy
  listens, not that every component loaded.
- **ClickHouse** probes `127.0.0.1`, not `localhost`: it listens on IPv4 only and busybox `wget`
  resolves `localhost` to `::1` first, so it would never report healthy.
- **Loki** gets twenty retries, not ten — it waits on `minio-init`, slow on a cold pull.

---

## Checking it

```bash
docker compose -f infra/docker-compose.yml --profile '*' config --quiet   # valid?
docker compose -f infra/docker-compose.yml --profile '*' config --services # what would run
docker network inspect ratchet_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

`config` resolves variables, applies `.env` and validates without starting anything — the fastest
check of an edit, and what CI should run if the file grows.

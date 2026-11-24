---
title: infra
description: The local stack — every file, every service, and how they reach each other. Nine containers, two profiles, one bridge network.
---

# `infra/`

> The files live in [`infra/`](../../infra/docs/index.md) at the repository root —
> `docker-compose.yml`, the init scripts and the Loki/Alloy configs — next to the compose file that
> mounts them. The documentation sits here with the other trees.

Everything the application talks to, as containers. No package imports any of it: these are
[Tier 0](../opinions/dependencies.md) dependencies, reached over a protocol the code speaks anyway.
**This is the reference** — what each file does, how each service works, how they connect. Running it
beyond a laptop is [deployment](deployment.md).

---

## Every file

| File | Read by | Explained in |
|---|---|---|
| `docker-compose.yml` | `docker compose` | [compose](reference/compose.md) |
| `postgres.init.sql` | Postgres, on first boot only | [postgres](reference/postgres.md) |
| *(no file)* | pgBouncer, from compose env | [pgbouncer](reference/pgbouncer.md) |
| `loki.config.yml` | Loki, at startup | [loki](reference/loki.md) |
| `alloy.config.alloy` | Alloy, at startup | [alloy](reference/alloy.md) |
| `logs/` | Alloy, tailed continuously | [alloy](reference/alloy.md) |
| `.env` | `docker compose` | [compose](reference/compose.md#host-ports) |

Redis and Mailpit have no config file — flags and defaults only ([redis](reference/redis.md),
[mailpit](reference/mailpit.md)).

**Configs are flat on purpose:** each is one mounted file, so a folder per service would hold one
thing. `packages/infrastructure/src/` gives the opposite answer because there each vendor is several
modules. **Structure is earned by contents, not symmetry** ([Simplicity](../opinions/simplicity.md)).

---

## How the services connect

One bridge network, `ratchet_default`; **containers reach each other by service name** via Docker's
embedded DNS.

```
                    ┌──────────────────────────── host ────────────────────────────┐
                    │                                                              │
   pnpm dev ────────┼──→ :5432 postgres      :6379 redis-cache   :6380 redis-queue │
   (apps on host)   │    :9000 minio (S3)    :3100 loki (query API)                │
                    │                                                              │
                    └──────────────────────────────────────────────────────────────┘
                                              │
   ══════════════════════════ ratchet_default (bridge) ═══════════════════════════════

     ┌──────────┐   ┌─────────────┐  ┌─────────────┐   ┌───────┐
     │ postgres │   │ redis-cache │  │ redis-queue │   │ minio │
     └────┬─────┘   └─────────────┘  └─────────────┘   └───┬───┘
          │                                                │
          │                                      chunks +  │  bucket `loki`
          │                                       index    │
          │                                                │
                            ┌──────┐  ────────────────────────┘
     query_range ──────────→│ loki │
            :3100           └──▲───┘
                             │ push  loki:3100/loki/api/v1/push
                          ┌──┴────┐
                          │ alloy │──── reads /var/run/docker.sock (every container's stdout)
                          └───────┘──── tails /var/log/app/*.log  (= infra/logs/)
```

- **Nothing connects to the applications.** The apps dial Postgres, Redis and MinIO from the host;
  Alloy *reads* their output. That keeps the log platform swappable ([alloy](reference/alloy.md)).
- **MinIO has two unrelated consumers:** uploads in the `ratchet` bucket, Loki chunks and index in
  `loki` ([minio](reference/minio.md)).
- **No container reads logs back, and none will.** The reader is
  [`LokiLogReader`](../../packages/infrastructure/docs/reference/loki.md) (built when `LOKI_URL` is
  set) feeding the super-admin dashboard, which knows what an organization is; Grafana was removed for
  that reason ([compose](reference/compose.md#why-there-is-no-log-ui)). `docker compose logs` and curl
  stay the break-glass path ([loki](reference/loki.md)).
- **Only Alloy touches the Docker socket**, read-only, for container stdout.

### Ports: inside versus outside

Confusing the two is the usual "connection refused".

| Service | Inside the network | From the host |
|---|---|---|
| postgres | `postgres:5432` | `localhost:15432` — **direct**, `DATABASE_DIRECT_URL` |
| pgbouncer | `pgbouncer:5432` | `localhost:16432` — **pooled**, `DATABASE_URL` |
| redis-cache | `redis-cache:6379` | `localhost:16379` |
| redis-queue | `redis-queue:6379` | `localhost:16380` |
| mailpit | `mailpit:1025` | `localhost:11025`, UI `:8025` |
| minio | `minio:9000` | `localhost:19000`, console `:9001` |
| loki | `loki:3100` | `localhost:13100` |
| alloy | `alloy:12345` | `localhost:12345` |
| clickhouse | `clickhouse:8123` | `localhost:18123`, native `:9002` |

**Both Redis instances listen on 6379 inside** — only host mappings differ; `redis-queue:6380` inside
the network refuses. ClickHouse's native port maps to 9002 because MinIO owns 9000.

---

## Startup order

Two declared dependencies, both real:

```
minio ──healthy──→ minio-init ──completed──→ loki ──healthy──→ alloy
```

Loki needs its bucket; Alloy needs Loki accepting writes. The rest start in parallel. **`minio-init`
is a one-shot** — `exited (0)` is success; without it the first upload fails with `NoSuchBucket` and
looks like a code bug.

---

## What flows where

| Data | From | To | Durable? |
|---|---|---|---|
| Domain rows, audit trail | use-cases | Postgres | **yes** — the source of truth |
| Uploaded files | `StorageGateway` | MinIO `ratchet` | **yes** — a second source of truth |
| Outbound mail | `SmtpEmailSender` | mailpit *(delivered nowhere)* | no — in memory, cleared on restart |
| Capability and session cache | `CacheStore` | redis-cache | no — rebuilt from Postgres |
| Queued jobs | `QueuePublisher` | redis-queue | **yes** — derived from nothing |
| Diagnostic log lines | `JsonLogger` → stdout | Alloy → Loki → MinIO `loki` | no — 30 days, lossy |
| Analytics aggregates | worker, replaying `activity_log` | ClickHouse *(stopped by default)* | no — replayable |

The rule ([Data and scale](../opinions/data-and-scale.md)): **Postgres owns anything a transaction
depends on or a user reads right after writing; everything else is a derived store behind a port.**

---

## Running it

```bash
pnpm infra up              # four stores + observability     ← the normal command
pnpm infra up core            # four stores only
pnpm infra up analytics    # the above, plus ClickHouse
pnpm infra down            # stop everything, keep volumes
pnpm infra reset           # stop everything, destroy volumes
pnpm infra logs            # tail every service
```

| Profile | Services | Default |
|---|---|---|
| *(none)* | `postgres`, `pgbouncer`, `redis-cache`, `redis-queue`, `mailpit`, `minio`, `minio-init` | always |
| `observability` | `loki`, `alloy` | **on** — the diagnostic stream is live today |
| `analytics` | `clickhouse` | **off** — see [clickhouse](reference/clickhouse.md) |

**Starting ClickHouse and feeding it are separate switches:** `pnpm infra up analytics` runs the
container; `CLICKHOUSE_URL` makes the app build a projector and the worker register projection and
reconciliation schedules. Both default off; the adapters exist either way.

> `down`, `reset` and `logs` pass `--profile "*"` — otherwise a reset leaves ClickHouse running and
> `logs` omits it.

**Credentials are `ratchet` / `ratchet`, MinIO `ratchet` / `ratchetsecret`**, hard-coded on purpose:
a scratch database behind a secret is one nobody can debug.

---

## Checking the whole stack

```bash
docker compose -f infra/docker-compose.yml ps
```

Seven `healthy`, `minio-init` `exited (0)`, no `clickhouse`.

```bash
# every service is being collected — one entry per container
curl -s -G http://localhost:13100/loki/api/v1/label/app/values | jq -r '.data[]' | sort
```

| Symptom | Usually |
|---|---|
| `connection refused` from inside a container | Used the host port instead of the container port |
| Alloy healthy, no logs in Loki | Project-name filter mismatch — [alloy](reference/alloy.md) |
| Loki unhealthy on first boot | Waiting on `minio-init`; give it the twenty retries |
| A fifth label appears | Loki or a source component invented it — [alloy](reference/alloy.md) |
| ClickHouse table "missing" | It is in `default`, not `ratchet` — [clickhouse](reference/clickhouse.md) |
| Port already allocated | Something else owns it — [compose](reference/compose.md#host-ports) |

Per-service checks are on each reference page.

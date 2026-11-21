---
title: infra
description: Nine containers the application dials and nothing imports — what this directory holds, what each service publishes, and the two conditions a new one has to clear.
---

# `infra/`

Below the bottom of the dependency graph, so not a package: nothing in `packages/` or `apps/` imports
anything here. These are [Tier 0](../../docs/opinions/dependencies.md) dependencies, reached over a
protocol the code speaks anyway (Postgres over `pg`'s wire format), so the seam already exists and
this directory only decides what listens on the other end. That is also why the local stack is real
containers, not in-process fakes — a filesystem S3 means the S3 path first runs on deploy day.

| | |
| --- | --- |
| **Directory** | `infra/` — not a package, no `package.json`, nothing to publish |
| **Entrypoint** | `docker-compose.yml`, always via `-f infra/docker-compose.yml` |
| **Depends on** | Docker, and the `.env` at the repository root |
| **Used by** | `pnpm dev`, `apps/web`, `apps/worker` — over TCP, never by import |
| **Environment** | development only; the production analogue is [deployment](../../docs/infra/deployment.md) |
| **Build** | none — `pnpm infra:up` pulls images and starts them |

```
infra/
├── docker-compose.yml      → nine services, three profiles, one bridge network
├── postgres.init.sql       → vector, pg_trgm, uuid-ossp — run on first boot only
├── loki.config.yml         → single-binary Loki, chunks and index into MinIO
├── alloy.config.alloy      → docker stdout + infra/logs/ → Loki, four labels
├── logs/                   → what Alloy tails; .gitkeep only
└── docs/                   → this page
```

## What belongs here

Both conditions are required:

1. **The app reaches it over a protocol, not an import.** Needing a `.ts` file makes it a package; the
   adapter belongs in `packages/infrastructure/src/<vendor>/`.
2. **A managed service replaces it in production with no code change.** If nothing rentable speaks the
   same protocol, the container is a dependency you cannot leave later.

**The second gets skipped**, which is how a local convenience becomes permanent. MinIO clears it — the
AWS SDK talks to it unchanged. A log platform that only *receives* stdout clears both and still gets no
folder in `packages/infrastructure/src/` until something reads it over an API — hence `loki/` holding a
reader and no writer ([Folders](../../docs/opinions/folders.md)).

## What each service publishes

| Service | From the host | Spoken by | Profile |
|---|---|---|---|
| [postgres](../../docs/infra/reference/postgres.md) | `localhost:15432` | `drizzle-orm` + `pg` | always |
| [redis-cache](../../docs/infra/reference/redis.md) | `localhost:16379` | `CacheStore` | always |
| [redis-queue](../../docs/infra/reference/redis.md) | `localhost:16380` | `QueuePublisher`, BullMQ | always |
| [mailpit](../../docs/infra/reference/mailpit.md) | `localhost:11025`, UI `:8025` | `SmtpEmailSender` | always |
| [minio](../../docs/infra/reference/minio.md) | `localhost:19000`, console `:9001` | `StorageGateway`, AWS SDK | always |
| [minio-init](../../docs/infra/reference/minio.md) | — | nothing; creates buckets and exits | always |
| [loki](../../docs/infra/reference/loki.md) | `localhost:13100` | `LokiLogReader`, when `LOKI_URL` is set | `observability` |
| [alloy](../../docs/infra/reference/alloy.md) | `localhost:12345` | nothing — it reads, it is not called | `observability` |
| [clickhouse](../../docs/infra/reference/clickhouse.md) | `localhost:18123`, native `:9002` | the worker's projector, when `CLICKHOUSE_URL` is set | `analytics` |

Three rows that look like mistakes: **two Redis containers** (a flushable cache and a queue whose loss
is data loss — [Data and scale](../../docs/opinions/data-and-scale.md)); **`minio-init` at `exited (0)`
is success** (without it the first upload fails `NoSuchBucket`); **nothing dials Alloy** (it reads the
socket and `logs/`, so the log platform swaps by deleting a container). Starting ClickHouse
(`pnpm infra:up:analytics`) and feeding it (`CLICKHOUSE_URL`) are separate switches.

## Running it

```bash
pnpm infra:up              # the four stores + observability     ← the normal command
pnpm infra:core            # the four stores only
pnpm infra:up:analytics    # the above, plus ClickHouse
pnpm infra:down            # stop everything, keep volumes
pnpm infra:reset           # stop everything, destroy volumes
```

`down`, `reset` and `logs` pass `--profile "*"`, or a reset leaves ClickHouse running. `docker compose
-f infra/docker-compose.yml ps` should show seven `healthy`, `minio-init` `exited (0)`, no
`clickhouse`; troubleshooting is in [`docs/infra/`](../../docs/infra/index.md#checking-the-whole-stack).

## See also

- [`docs/infra/`](../../docs/infra/index.md) — the stack reference and per-file pages;
  [deployment](../../docs/infra/deployment.md) is the same services on a rented box.
- [`@loadbearing/infrastructure`](../../packages/infrastructure/docs/index.md) — the adapters dialling
  these ports, one folder per vendor.
- [Data and scale](../../docs/opinions/data-and-scale.md) — which store owns what.

---
title: Deployment
description: One VPS now, managed services later — what changes, what never changes, and the order to move things in when it stops fitting on one box.
---

# Deployment

The same nine services on a rented machine, then, service by service, on machines somebody else
operates. **The application code never changes between stages:** every store is behind a port
([Dependencies](../opinions/dependencies.md)), every credential is an `.env` value, and no package
reads `process.env` — so each move is a config change, not a migration.

> **Nothing on this page has been executed.** The local stack in [index](index.md) is verified; this
> is design, and the first real deployment will find what it got wrong.

---

## First: the ports are wide open

The compose file publishes every service on **all interfaces**:

```
postgres      0.0.0.0:5432->5432/tcp
redis-cache   0.0.0.0:6379->6379/tcp     ← no password
redis-queue   0.0.0.0:6380->6379/tcp     ← no password
minio         0.0.0.0:9000->9000/tcp
loki          0.0.0.0:3100->3100/tcp     ← no auth, accepts writes
```

Harmless behind NAT; **on a public VPS it is a database, two unauthenticated caches, an object store
and an open log API on the internet**, found by scanners in minutes.

> [!CAUTION]
> **A firewall does not fix this.** Docker writes iptables rules into `DOCKER-USER`, evaluated
> *before* UFW's chains — `ufw deny 5432` reports active and the port stays reachable.

**Stop publishing instead of filtering.** Container-only services need no `ports:` (they are
reachable on the bridge network by name); the overlay below removes every publish but the proxy's.
For host access (`psql` from a laptop), bind to loopback and tunnel:

```yaml
ports: ["127.0.0.1:15432:5432"]
```

```bash
ssh -L 5432:localhost:15432 you@vps    # then psql against localhost:5432
```

---

## Phase 1 — one VPS

Everything on one box under Compose, no orchestrator — the right shape for a long time; most products
never outgrow it ([Data and scale](../opinions/data-and-scale.md)).

| | vCPU | RAM | Disk |
|---|---|---|---|
| Minimum to run | 2 | 4 GB | 40 GB SSD |
| Comfortable | 4 | 8 GB | 80 GB SSD |

Postgres and Loki want the memory; disk is mostly `pgdata` and MinIO (the `loki` bucket is bounded by
thirty-day retention). **This assumes ClickHouse is not running** — it is sized separately and does
not fit on this box.

### The production overlay

Keep `docker-compose.yml` as the base and add a file with only the differences; Compose merges left
to right:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**`infra/docker-compose.prod.yml`** — illustrative; write it on the host, it is not in the repository.

```yaml
services:
  # ── stop publishing anything but the proxy ────────────────
  postgres:
    ports: !override []
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    deploy:
      resources:
        limits: { memory: 2G }

  redis-cache:
    ports: !override []
    command: ["redis-server", "--save", "", "--maxmemory-policy", "allkeys-lru",
              "--maxmemory", "512mb", "--requirepass", "${REDIS_PASSWORD:?required}"]

  redis-queue:
    ports: !override []
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction",
              "--requirepass", "${REDIS_PASSWORD:?required}"]

  minio:
    ports: !override []
    environment:
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:?required}

  loki:
    ports: !override []

  alloy:
    ports: !override []

  # ── the applications, which are containers here ───────────
  web:
    build: { context: .., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped
    # One web process per core: rendering is single-threaded, and one process leaves the
    # other cores idle. cluster.mjs forwards SIGTERM, drains each worker and restarts a
    # crashed one. It starts no more than WEB_DATABASE_CONNECTIONS / DATABASE_POOL_MAX
    # processes, and refuses a WEB_PROCESSES whose product is over that budget.
    command: ["node", "apps/web/cluster.mjs"]
    env_file: [.env.production]
    environment:
      APP: web
      ENV: production
    depends_on:
      postgres: { condition: service_healthy }

  worker:
    build: { context: .., dockerfile: apps/worker/Dockerfile }
    restart: unless-stopped
    env_file: [.env.production]
    environment:
      APP: worker
      ENV: production
    depends_on:
      postgres: { condition: service_healthy }

  # Every open browser stream, and nothing else. The same `.env.production`, so the
  # same `AUTH_SECRET` — the web app signs the cookie this process reads.
  realtime:
    build: { context: .., dockerfile: apps/realtime/Dockerfile }
    restart: unless-stopped
    env_file: [.env.production]
    environment:
      APP: realtime
      ENV: production
      REALTIME_PORT: "3001"
    # Longer than `REALTIME_SHUTDOWN_TIMEOUT_MS`, or Docker kills the drain half-way.
    stop_grace_period: 30s
    depends_on:
      postgres: { condition: service_healthy }

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddydata:/data
    depends_on: [web]

volumes:
  caddydata:
```

- **`!override []`** replaces the base `ports` list; without it Compose appends and the publish stays.
- **`${VAR:?required}`** refuses to start on an unset variable — a Redis started with
  `--requirepass ""` accepts every connection.
- **`--maxmemory 512mb`** is what makes `allkeys-lru` trigger; without a ceiling the cache grows
  until the box does.

### Readiness

`depends_on: … service_healthy` orders container *starts*; it says nothing about whether the app can
serve. **`GET /api/health` is that answer** — point the load balancer, orchestrator or Caddy at it,
not at an open port:

```yaml
  web:
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s
```

**Use it as a readiness probe, never liveness.** Readiness holds an instance out of the pool while
Postgres starts; liveness on the same endpoint kills the container and turns one slow database into a
restart loop everywhere. The report names `database`, `cache`, `queue` and `analytics` (`null` when
ClickHouse is not configured — neither healthy nor degraded). **Loki is excluded** — logs are lossy
by design, so a down collector is no reason to drain a working instance.

**The worker has no HTTP surface.** Its liveness is the `process.started` line with its consumer
count; its readiness is that it consumes — which is why the `analytics-reconcile` schedule exists:
no probe finds a worker that died quietly on a Tuesday.

### Logging gets simpler in production

Locally `pnpm dev` runs on the host, so Alloy needs the `infra/logs` file tail
([alloy](reference/alloy.md)). In production `web`, `worker` and `realtime` are in the same Compose
project, so `discovery.docker` finds them with **no config change** (the
`com.docker.compose.project=ratchet` filter matches) and the file tail goes unused. `APP: web|worker|
realtime` is what distinguishes the `app` label, which is why the pipeline reads it from the log body,
not the container name.

### TLS

**`infra/Caddyfile`** — illustrative; write it on the host.

```
example.com {
    # Before the catch-all. `flush_interval -1` writes each event as it arrives; Caddy
    # already streams `text/event-stream`, and saying so survives a config refactor.
    handle /api/realtime/* {
        reverse_proxy realtime:3001 {
            flush_interval -1
        }
    }
    # Compressed here and only here: an encoder buffers, and a buffered stream stalls.
    handle {
        encode zstd gzip
        reverse_proxy web:3000
    }
}
```

- **Compress web responses at the proxy** — Node sends them raw, and a large doc page is ~1.1 MB raw
  vs 59 KB gzipped (the sidebar repeats class names per link). **Never the stream path**: a buffered
  event stream arrives late or never. In nginx: `gzip on` in the web location only.
- **Streams go to their own process.** Every tab holds one or two streams while open; `apps/realtime`
  holds all of them so the web event loop holds none. One origin keeps the session cookie riding
  along. In nginx the stream location needs `proxy_buffering off` and `proxy_read_timeout` above the
  thirty-minute stream age.
- Caddy issues and renews Let's Encrypt certificates; `caddydata` persists them (without it every
  deploy re-issues and hits rate limits). Both targets are bridge-network service names; Caddy is the
  only published port.

### Secrets

`.env.production` lives on the VPS, never committed — `.gitignore` covers `.env.*` except
`.env.example`. Local values are `ratchet` on purpose (a scratch database behind a secret is one
nobody can debug); generate real ones:

```bash
openssl rand -base64 32      # AUTH_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD, …
```

Docker secrets, SOPS or a cloud secret manager improve on a file without changing the application,
which reads `process.env` in exactly two files.

### Deploying

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build web worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm web pnpm db:migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Migrate as a one-shot before new containers start**, or old code briefly meets the new schema.
Hence: **every migration must work with the currently running code** — add a column, deploy the
writer, drop the old column later; a rename is two deploys. Building on the VPS is slow; building in
CI and pushing to a registry only turns `build:` into `image:`.

### Backups — the part that matters

What cannot be rebuilt must be backed up:

| Volume | Back up? | Why |
|---|---|---|
| `pgdata` | **yes** | the source of truth |
| `miniodata` — `ratchet` bucket | **yes** | uploaded bytes are a second source of truth |
| `redisqueuedata` | **yes** | a queued job is derived from nothing |
| `miniodata` — `loki` bucket | no | 30 days of diagnostics, lossy by design |
| redis-cache | no volume | rebuilt from Postgres on a miss |
| `clickhousedata` | no | replay the activity log |

```bash
# nightly, to somewhere that is not this VPS
docker compose exec -T postgres pg_dump -U ratchet -Fc ratchet > backup-$(date +%F).dump
docker compose exec -T minio mc mirror local/ratchet /backup/ratchet
```

> **A backup you have not restored is a hypothesis.** Restore into a scratch database and run the app
> against it on a schedule — the most skipped step on a self-hosted VPS, and the unrecoverable one.

`pg_dump` suits a few tens of gigabytes; past that, WAL-G or pgBackRest to object storage gives
point-in-time recovery — and managed Postgres starts looking cheap.

---

## What breaks first

In rough order, and none is the database:

| Symptom | Move to |
|---|---|
| Deploys have visible downtime | Two `web` replicas behind Caddy, drain on stop |
| The box is memory-bound at idle | Managed Loki (Grafana Cloud) — it is the largest non-Postgres consumer |
| Disk fills | S3 for uploads; MinIO on the same disk as `pgdata` is the trap |
| Postgres CPU spikes on dashboards | A read replica, or KPI snapshot tables — [Data and scale](../opinions/data-and-scale.md) §5 |
| A bad deploy loses queued jobs | Managed Redis for the queue, with real persistence |
| One machine is a single point of failure | Everything below |

**Two web replicas is the best early move** — the web tier is stateless (no request state in
`Container`, no module-scope `QueryClient`, sessions in Postgres and Redis), and the worker scales
separately since BullMQ repeatable jobs dedupe across replicas.

**One queue can scale alone:** `WORKER_QUEUES` picks the queues a worker service serves.

```yaml
  worker:
    environment: { APP: worker, WORKER_QUEUES: "mail,event,notification,maintenance" }
  worker-embedding:
    build: { context: .., dockerfile: apps/worker/Dockerfile }
    env_file: [.env.production]
    environment: { APP: worker, WORKER_QUEUES: embedding }
    deploy: { replicas: 3 }
```

Every queue needs at least one service — an unserved queue fills silently. See
[the supervisor](../../apps/worker/docs/reference/supervisor.md).

### Scaling the assistant

An answer is slow I/O, not CPU. One worker process holds **`WORKER_ASSISTANT_CONCURRENCY` answers at
once** (default 32); throughput is that divided by answer duration, and the excess waits in the
`assistant` queue rather than being refused.

`pnpm assistant:load` measures it, against `ASSISTANT_PROVIDER=fake` with `ASSISTANT_FAKE_DELAY_MS`
set to a realistic duration. Measured 2026-11-10 on one 4-core, 16 GB laptop running `pnpm dev`, every
container and the load generator; each row is 240 questions from 60 users, ~3 s of streaming each:

| Answers at once | Answers a second | Send p95 | First word p50 / p95 | Finished p50 / p95 | Failed |
|---|---|---|---|---|---|
| 10 | 3.3 | 293 ms | 448 / 864 ms | 2.9 / 3.6 s | 0 |
| 30 | 9.2 | 873 ms | 490 / 1 656 ms | 3.0 / 4.3 s | 0 |
| 60 | 10.3 | 635 ms | 2.9 / 4.0 s | 5.4 / 6.5 s | 0 |

**The ceiling is the lane, by design:** at 60 the 32 slots are full, throughput stops near 32 ÷ 3 s,
and the excess shows as time-to-first-word (queue wait). One web and one realtime process carried 60
open streams without error. Read it as a shape, not a capacity — dev mode, one machine, a provider
that never slows.

For 100K users (about 5K answers at once, a 10K peak):

| Bottleneck | What moves it |
|---|---|
| Answers at once | More slots (`WORKER_ASSISTANT_CONCURRENCY`), then more worker services with `WORKER_QUEUES=assistant` — about 160 processes at 32 slots hold 5K. The platform Workers page autoscales a lane between its min and max |
| The provider | `WORKER_ASSISTANT_RATE_PER_MINUTE` caps what is sent; OpenRouter or several keys spread it. The provider contract is the real ceiling |
| Open streams | More `apps/realtime` replicas behind the proxy; a stream is open only while its answer is |
| Redis fan-out | `REDIS_ASSISTANT_URL` on its own instance. Keys carry hash tags, so Redis Cluster is an adapter change |
| One person, or one tenant | `ASSISTANT_ACTIVE_PER_USER`, `assistant.send`'s 20 a minute, and `ASSISTANT_ORG_DAILY_TOKENS` |

The script signs in one user per two requested answers (a person may run two at once and send 20 a
minute), signing up `load-<n>@example.test` through Mailpit on first run at the auth limit of five
sign-ups a minute, and caches sessions in the temp directory.

---

## Phase 2 — managed services, in risk order

Move in **increasing order of how much a mistake hurts**, not cost. Each row is a line or two in
`.env.production` and a restart.

| # | Service | Becomes | Config change | Risk |
|---|---|---|---|---|
| 1 | Loki | Grafana Cloud (or any Loki-compatible host) | `loki.write` url + basic auth | none — derived, 30 days |
| 2 | MinIO | S3 / R2 | `S3_*`, `S3_FORCE_PATH_STYLE=false` | low — copy, then flip |
| 3 | redis-cache | Upstash / ElastiCache | `REDIS_CACHE_URL` | none — it is a cache |
| 4 | redis-queue | a **separate** managed Redis | `REDIS_QUEUE_URL` | medium — drain first |
| 5 | Postgres | RDS / Cloud SQL / Neon | `DATABASE_URL` | high — the real migration |

ClickHouse is not here: every row is the same capability run by someone else, and ClickHouse is a new
capability (below).

### 1. Logs — losing them costs nothing

```alloy
loki.write "default" {
  endpoint {
    url = "https://logs-prod-000.grafana.net/loki/api/v1/push"
    basic_auth {
      username = env("GRAFANA_CLOUD_USER")
      password = env("GRAFANA_CLOUD_TOKEN")
    }
  }
}
```

Drop `loki` from the overlay and keep Alloy. **The pipeline, four labels and event catalog are
unchanged** — the payoff of no package importing a Loki client. Free to reverse, and it removes the
largest memory consumer after Postgres.

### 2. Object storage

Objects are immutable and keyed, so it is a copy and a flip:

```bash
mc mirror --watch local/ratchet s3/your-bucket    # runs until you stop it
```

Then change five values and restart. `S3_FORCE_PATH_STYLE=false` is the easy one to miss; it shows as
DNS errors naming a bucket-prefixed host. The `loki` bucket does not move if step 1 is done.

#### The bucket's CORS rule

Browsers upload doc images straight to the bucket; MinIO answers
every origin, S3 and R2 none, and the failure is a browser CORS error in no server log. Allow only
`POST` — the upload is a presigned `POST` whose policy binds size and type. `GET`/`HEAD` are
unnecessary: `/api/doc-image/…` redirects an `<img>` to a signed URL.

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.example.com"],
      "AllowedMethods": ["POST"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

```bash
aws s3api put-bucket-cors --bucket your-bucket --cors-configuration file://cors.json
aws s3api get-bucket-cors --bucket your-bucket     # read it back
```

`AllowedOrigins` is `APP_BASE_URL` with no trailing slash, one entry per origin (add staging to the
same rule). R2 takes the same JSON in the bucket settings. Local MinIO has no bucket CORS API
(`mc cors set` is "not implemented"), so `minio-init` leaves it alone — see
[the compose reference](reference/compose.md).

### 3 and 4. The two Redis instances, separately

**The cache:** change the URL, restart, accept a cold minute while it refills from Postgres.

**The queue holds jobs that exist nowhere else:**

1. Pause every queue from the platform **Workers** page (or stop the worker); publishers keep
   enqueueing to the old instance.
2. Wait for depth zero.
3. Flip `REDIS_QUEUE_URL`, restart both.
4. Confirm the old instance is empty before deleting it.

**Keep two managed instances** — consolidating recreates one eviction policy for two durability needs
([redis](reference/redis.md)). Check each provider's `noeviction` support and persistence: a queue on
an evicting instance loses work silently.

### 5. Postgres last

Highest value, highest risk, and most worth paying for — backups, point-in-time recovery and failover
stop being your problem.

- **Dump and restore:** simple, with a maintenance window sized by your data.

  ```bash
  pg_dump -Fc $OLD | pg_restore -d $NEW
  ```

- **Logical replication:** near-zero downtime, more moving parts — replicate, let it catch up, pause
  briefly to switch `DATABASE_URL`. Most providers document or tool it.

**Check extensions on the target first** — `pgvector` is not everywhere:

```sql
SELECT * FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm', 'uuid-ossp');
```

**Confirm partitioned tables arrived partitioned.** `pg_dump`/`restore` preserves it; a naive
`COPY`-based migration flattens `activity_log` into a table needing the painful conversion later.

---

## Adopting ClickHouse — a different axis

Not the same capability run by someone else, but a **new store, consumer and dependency** on its own
timeline — on the original VPS or as ClickHouse Cloud, independently of Phase 2. **Do not start here:**
Postgres covers this kit's questions for years, and the container is deliberately stopped.

**The trigger:** snapshot tables stop covering the questions asked — not "the table is large" or "it
would be faster". **The prerequisites, which get skipped:**

1. **A projection consumer** on the `analytics` queue, writing rows.
2. **A daily reconciliation** comparing per-day counts against the activity log.
3. **A replay path** rebuilding the store from the activity log.

Without 1 the store is an empty database that looks like a decision; without 2 a consumer dead since
Tuesday becomes a wrong number in March; without 3 it is not derived, whatever the docs claim.

**In code:** the write half ships (`ClickHouseAnalyticsProjector`, the projection consumer, nightly
reconciliation, enabled by `CLICKHOUSE_URL`). The read half is deliberately absent: a new port in
`packages/application/src/port/`, an adapter, one `Container` line and the real dashboard queries — a
day's work against a store already filling ([Simplicity](../opinions/simplicity.md) on the deleted
guess). `ContainerConfig` gains an `analytics` block and `apps/*/src/env.ts` its variables.

**On a VPS, give it its own box.** ClickHouse takes all the memory and I/O it can, and Postgres
depends on a warm page cache; under a heavy query Postgres latency degrades in a way that looks like a
database problem and is a scheduling one. If it must share, cap it and accept both are slower:

```yaml
clickhouse:
  ports: !override []
  environment:
    CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:?required}
  deploy:
    resources:
      limits: { memory: 4G }
```

| | vCPU | RAM | Disk |
|---|---|---|---|
| Smallest useful | 4 | 16 GB | 200 GB SSD |

Reach it over a private network (VPC, WireGuard, the provider's internal network), never the public
internet. **`CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1` in the base compose is a local convenience** —
set a real password and drop it before anything reachable.

**Backups: none, which is a claim to test.** `clickhousedata` is rebuildable only if replay works.
Before relying on it: replay a month into a scratch instance, compare counts and a few aggregates, and
time it (a four-day rebuild is no recovery plan). The daily reconciliation is the same query on one
day. **Needing to back it up is a signal** that something authoritative lives there — most likely a
KPI in a materialized view stored nowhere else.

**Managed** (ClickHouse Cloud, Altinity.Cloud, Aiven) has **nothing to migrate**: point the consumer
at it, replay, drop the old one. With a high operational burden and near-zero switching cost, it is
the one store where "managed from day one" is the easy call.

---

## What never changes

- **`packages/application`** — sharding and hosting are repository concerns.
- **`packages/permissions`** — pure computation, identical in every runtime.
- **`packages/contracts`** — unchanged.
- **The event catalog and four log labels** — the pipeline moves, the vocabulary does not.
- **Every port** — `CacheStore`, `QueuePublisher`, `StorageGateway`, `VectorStore`,
  `AnalyticsProjector`; a managed service is one different constructor argument in `Container`.
- **`.env` as the only config surface** — `check-architecture.mjs` §3, so moving a service is never a
  code search.

The compose file, the overlay and `.env.production` are the whole deployment surface — the
architecture's claim, and this page is where it holds or does not.

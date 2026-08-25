---
title: infra
description: The local stack — every file, every service, and how they reach each other. Nine containers, two profiles, one bridge network.
---

# `infra/`

Everything the application talks to, as containers. Nothing here is imported by any package — these
are [Tier 0](../../docs/opinions/dependencies.md) dependencies, provided by the deployment and
reached over a protocol the code was going to speak anyway.

[11 · Local Infrastructure](../../docs/setup/11-local-infrastructure.md) is the build order and
explains *why* each choice was made. **This is the reference:** what each file does, how each service
works, and how they connect.

**Running it somewhere other than a laptop is [deployment](deployment.md)** — the same nine services
on a VPS, and the order to move them to managed services in when one box stops fitting.

---

## Every file

| File | Read by | Explained in |
|---|---|---|
| `docker-compose.yml` | `docker compose` | [compose](reference/compose.md) |
| `postgres.init.sql` | Postgres, on first boot only | [postgres](reference/postgres.md) |
| `loki.config.yml` | Loki, at startup | [loki](reference/loki.md) |
| `alloy.config.alloy` | Alloy, at startup | [alloy](reference/alloy.md) |
| `grafana.datasources.yml` | Grafana, at startup | [grafana](reference/grafana.md) |
| `clickhouse.init.sql` | ClickHouse, on first boot only | [clickhouse](reference/clickhouse.md) |
| `logs/` | Alloy, tailed continuously | [alloy](reference/alloy.md) |
| `.env` | `docker compose` | [compose](reference/compose.md#host-ports) |

Redis has no config file — every setting is a command-line flag in the compose file. See
[redis](reference/redis.md).

**The config files are flat on purpose.** Each is mounted as a single file, so a directory per
service would be a path holding one thing. `docs/` is nested because there is genuinely a page's worth
to say about each — which is what earns structure ([Simplicity](../../docs/opinions/simplicity.md)).

---

## How the services connect

Compose creates one bridge network, `ratchet_default`, and joins every container to it. Inside that
network **a container reaches another by its service name** — Docker's embedded DNS resolves `loki`,
`minio`, `postgres` and so on to the container's address.

```
                    ┌──────────────────────────── host ────────────────────────────┐
                    │                                                              │
   pnpm dev ────────┼──→ :5432 postgres      :6379 redis-cache   :6380 redis-queue │
   (apps on host)   │    :9000 minio (S3)    :3001 grafana                         │
                    │                                                              │
                    └──────────────────────────────────────────────────────────────┘
                                              │
   ══════════════════════════ ratchet_default (bridge) ═══════════════════════════════

     ┌──────────┐   ┌─────────────┐  ┌─────────────┐   ┌───────┐
     │ postgres │   │ redis-cache │  │ redis-queue │   │ minio │
     └────┬─────┘   └─────────────┘  └─────────────┘   └───┬───┘
          │                                                │
          │  grafana queries                     chunks +  │  bucket `loki`
          │  postgres:5432                        index    │
          │                                                │
     ┌────┴─────┐         ┌──────┐  ────────────────────────┘
     │ grafana  │────────→│ loki │
     └──────────┘  :3100  └──▲───┘
                             │ push  loki:3100/loki/api/v1/push
                          ┌──┴────┐
                          │ alloy │──── reads /var/run/docker.sock (every container's stdout)
                          └───────┘──── tails /var/log/app/*.log  (= infra/logs/)
```

**Four things to take from that picture.**

**Nothing connects to the applications.** Traffic runs the other way: the apps dial Postgres, Redis
and MinIO from the host, and Alloy *reads* their output rather than being told anything. That is what
makes the log platform swappable — see [alloy](reference/alloy.md).

**MinIO has two unrelated consumers.** The application stores uploads in the `ratchet` bucket; Loki
stores its chunks and index in the `loki` bucket. They share a server and nothing else
([minio](reference/minio.md)).

**Grafana talks to two stores, not one.** Loki answers *what did the system do*; Postgres answers
*who did what*, because the audit trail is a Postgres table. Same UI, two sources
([grafana](reference/grafana.md)).

**Only Alloy touches the Docker socket**, read-only, and only to read container stdout.

### Ports: inside versus outside

Two numbers per service, and confusing them is the usual source of "connection refused".

| Service | Inside the network | From the host |
|---|---|---|
| postgres | `postgres:5432` | `localhost:5432` |
| redis-cache | `redis-cache:6379` | `localhost:6379` |
| redis-queue | `redis-queue:6379` | `localhost:6380` |
| minio | `minio:9000` | `localhost:9000`, console `:9001` |
| loki | `loki:3100` | `localhost:3100` |
| alloy | `alloy:12345` | `localhost:12345` |
| grafana | `grafana:3000` | `localhost:3001` |
| clickhouse | `clickhouse:8123` | `localhost:8123`, native `:9002` |

**Both Redis instances listen on 6379 inside.** They are different containers, so there is no
collision; only the host mapping differs. `redis-queue:6380` from inside the network is wrong and
will refuse.

Grafana is 3000 inside and 3001 outside because the web app owns 3000 on the host. ClickHouse's
native port maps to 9002 because MinIO owns 9000.

---

## Startup order

Only two dependencies are declared, and both are real:

```
minio ──healthy──→ minio-init ──completed──→ loki ──healthy──→ alloy
```

Loki cannot start until its bucket exists; Alloy has nowhere to push until Loki accepts writes.
Everything else starts in parallel — Postgres, Redis and MinIO have no dependencies on each other,
and Grafana will simply show a data source as down until Loki answers.

**`minio-init` is a one-shot container.** It creates both buckets and exits, so `exited (0)` in
`docker compose ps` is success. Without it the first upload fails with `NoSuchBucket` and everyone
goes looking for a code bug.

---

## What flows where

| Data | From | To | Durable? |
|---|---|---|---|
| Domain rows, audit trail | use-cases | Postgres | **yes** — the source of truth |
| Uploaded files | `StorageGateway` | MinIO `ratchet` | **yes** — a second source of truth |
| Capability and session cache | `CacheStore` | redis-cache | no — rebuilt from Postgres |
| Queued jobs | `QueuePublisher` | redis-queue | **yes** — derived from nothing |
| Diagnostic log lines | `JsonLogger` → stdout | Alloy → Loki → MinIO `loki` | no — 30 days, lossy |
| Analytics aggregates | worker, from domain events | ClickHouse *(stopped)* | no — replayable |

The rule behind that column is [Data and scale](../../docs/opinions/data-and-scale.md): **Postgres
owns anything a transaction depends on or a user reads immediately after writing; everything else is
a derived store behind a port.**

---

## Running it

```bash
pnpm infra:up              # four stores + observability     ← the normal command
pnpm infra:core            # four stores only
pnpm infra:up:analytics    # the above, plus ClickHouse
pnpm infra:down            # stop everything, keep volumes
pnpm infra:reset           # stop everything, destroy volumes
pnpm infra:logs            # tail every service
```

| Profile | Services | Default |
|---|---|---|
| *(none)* | `postgres`, `redis-cache`, `redis-queue`, `minio`, `minio-init` | always |
| `observability` | `loki`, `alloy`, `grafana` | **on** — the diagnostic stream is live today |
| `analytics` | `clickhouse` | **off** — see [clickhouse](reference/clickhouse.md) |

> `down`, `reset` and `logs` pass `--profile "*"`. Compose only acts on profiles it was given, so
> without it a reset leaves ClickHouse running and `logs` omits it from the output you are reading to
> debug it.

**Credentials are `ratchet` / `ratchet` everywhere except MinIO**, which is `ratchet` /
`ratchetsecret`. They are hard-coded on purpose: this stack holds nothing worth protecting, and a
scratch database behind a secret is a scratch database nobody can debug.

---

## Checking the whole stack

```bash
docker compose -f infra/docker-compose.yml ps
```

Seven `healthy`, `minio-init` `exited (0)`, no `clickhouse`.

```bash
# every service is being collected — one entry per container
curl -s -G http://localhost:3100/loki/api/v1/label/app/values | jq -r '.data[]' | sort
```

Per-service checks are on each reference page. The most common failures across all of them:

| Symptom | Usually |
|---|---|
| `connection refused` from inside a container | Used the host port instead of the container port |
| Alloy healthy, no logs in Loki | Project-name filter mismatch — [alloy](reference/alloy.md) |
| Loki unhealthy on first boot | Waiting on `minio-init`; give it the twenty retries |
| A fifth label appears | Loki or a source component invented it — [alloy](reference/alloy.md) |
| ClickHouse table "missing" | It is in `default`, not `ratchet` — [clickhouse](reference/clickhouse.md) |
| Port already allocated | Something else owns it — [compose](reference/compose.md#host-ports) |

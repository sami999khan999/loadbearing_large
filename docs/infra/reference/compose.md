---
title: docker-compose.yml
description: Nine services, two profiles, six volumes and one network — what every block does and which parts are load-bearing.
---

# `docker-compose.yml`

The only file here that Docker reads directly. Everything else is mounted into a container by it.

```yaml
name: ratchet
```

**The project name, and it appears in two places.** It prefixes every container (`ratchet-loki-1`),
every volume (`ratchet_pgdata`) and the network (`ratchet_default`) — and it is what
[`alloy.config.alloy`](alloy.md) filters on to decide which containers to collect. Change one without
the other and Alloy silently collects nothing: no error, no logs, and a debugging session that starts
in the wrong place.

---

## The network

There is no `networks:` block, which is itself the decision. Compose creates `ratchet_default` — a
bridge network — and joins every service to it.

Inside that network, **a service name is a hostname**. Docker runs an embedded DNS server at
`127.0.0.11` in each container, so `loki` resolves to the Loki container's address without anything
being configured. That is why `alloy.config.alloy` can say `http://loki:3100` and
`loki.config.yml` can say `endpoint: minio:9000`.

Declaring networks explicitly would buy segmentation — keeping Alloy off the database, say. That is
worth doing in production and is noise here, where every service is on one machine and the isolation
would be theatre.

---

## Services

### The four stores

| Service | Image | Notes |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | [postgres](postgres.md) |
| `redis-cache` | `redis:7-alpine` | evicts, no persistence — [redis](redis.md) |
| `redis-queue` | `redis:7-alpine` | never evicts, always persists — [redis](redis.md) |
| `minio` | `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` | S3 stand-in — [minio](minio.md) |

`minio-init` is a fifth, and it is a **one-shot**: an `mc` image runs an entrypoint that waits for
the MinIO API, creates both buckets and exits. `exited (0)` is success, and `compose-wait.mjs` holds
the stack un-ready until it is — a one-shot still running is doing the work the next step reads. It carries `restart: "no"` and no healthcheck, because a
container that is supposed to stop cannot be "unhealthy" — and without the explicit `restart` the
project default would keep starting a container whose whole job is to finish.

### Observability, profile `observability`

| Service | Image | Notes |
|---|---|---|
| `loki` | `grafana/loki:3.3.2` | [loki](loki.md) |
| `alloy` | `grafana/alloy:v1.5.1` | [alloy](alloy.md) |

#### Why there is no log UI

Two services, not three: this profile collects and stores, and nothing in it reads back. A `grafana`
container used to sit here and was removed deliberately.

The reasoning is that a log console and the super admin dashboard are the same job for the same
person, and running both means two places to look. The query an operator actually needs — *these
logs, for this tenant, joined to that tenant's audit rows* — is one Grafana cannot express, because
it has no concept of an organization. Grafana also carried the ad-hoc Postgres surface, which the
dashboard absorbs for the same reason.

The cost is accepted knowingly: **until the dashboard ships there is no log viewer**, and the
fallbacks are `docker compose logs -f <service>` and curl against Loki's `query_range` endpoint
([loki](loki.md)). Both stay useful afterwards — a log query that needs the app running is no use
during the incident where the app is down.

### Analytics, profile `analytics`

`clickhouse`, deliberately not started. See [clickhouse](clickhouse.md).

---

## Profiles

A service with no `profiles:` key always runs. A service with one runs only when that profile is
selected.

```bash
docker compose ... up -d                                  # 5 services
docker compose ... --profile observability up -d          # 8
docker compose ... --profile observability --profile analytics up -d   # 9
```

The `pnpm infra:*` scripts wrap those, with `observability` on by default.

> **`--profile "*"` on `down`, `reset` and `logs` is load-bearing.** Compose only acts on services in
> the profiles it was given. Without it, `docker compose down` leaves a profiled service running, and
> `logs -f` silently omits it from the output you are reading to debug it.

---

## Volumes

Six named volumes, and which are disposable is the whole point.

| Volume | Service | Rebuildable from |
|---|---|---|
| `pgdata` | postgres | migrations + seeds |
| `redisqueuedata` | redis-queue | **nothing** |
| `miniodata` | minio | uploads are a second source of truth; Loki chunks are not |
| `lokidata` | loki | index only — chunks live in MinIO |
| `clickhousedata` | clickhouse | replaying the activity log |

**`redis-cache` has no volume, on purpose.** A named volume for something explicitly disposable
invites the next person to treat it as durable.

`pnpm infra:reset` destroys all six. Locally that is fine — it is a scratch database. The habit is
what matters: in any environment with real pending work, clearing the cache and clearing the queue
are different operations, and the two-instance split is what makes it possible to do one without the
other.

### Bind mounts

Every config file is mounted individually, read-only:

```yaml
- ./loki.config.yml:/etc/loki/config.yml:ro
- ./postgres.init.sql:/docker-entrypoint-initdb.d/01-extensions.sql:ro
```

Docker creates the target's parent directories if they do not exist, so a single file can be placed
into a path the image never had. That is what removed the directory-per-service layout this folder
used to have.

Two exceptions are directory mounts, and both have to be:

```yaml
- ./logs:/var/log/app:ro              # Alloy globs *.log — a file mount cannot match a glob
- /var/run/docker.sock:/var/run/docker.sock:ro
```

**The socket needs a group, not just a mount.** It is `root:docker` on Linux and Alloy does not run
as root, so `group_add: ["${DOCKER_GID:-999}"]` is what makes the mount usable. Without it Alloy
starts, reports healthy, and collects nothing — the failure says nothing about its own cause. On
Docker Desktop the default is usually right; on Linux, `getent group docker` gives the real gid.

> **A single-file bind mount does not survive an editor that replaces the file.** Some editors write
> a new inode rather than modifying in place, and the container keeps the old one. Restart the
> service after editing a config; every one of these is read at startup anyway.

---

## Host ports

Every host port is a variable with the documented default; every container port is fixed.

```yaml
ports: ["${MINIO_CONSOLE_PORT:-9001}:9001"]
```

Port collisions on a developer machine are not hypothetical — this stack met one on its first run,
where `9001` was already held by an unrelated tool. The fix is a line in `infra/.env` — a file that
is **not in the repository**, because every port above already has a default and a template of
defaults would be a file to keep in step for no gain. Create it when you need one; Compose reads it
automatically, because with `-f infra/docker-compose.yml` the project directory is `infra/` and not
the repository root:

```ini
# infra/.env — you create this; gitignored, this machine only
MINIO_CONSOLE_PORT=9003
```

**It is not the root `.env`, and confusing the two is the common failure.** The root `.env` is what
the *applications* read through `env.ts`; `infra/.env` is what *Compose* reads. Override a port in
one and you must change the matching URL in the other — `MINIO_CONSOLE_PORT` has no counterpart, but
`POSTGRES_PORT` and `DATABASE_URL` do.

| Variable | Default | Variable | Default |
|---|---|---|---|
| `POSTGRES_PORT` | 5432 | `LOKI_PORT` | 3100 |
| `REDIS_CACHE_PORT` | 6379 | `ALLOY_PORT` | 12345 |
| `REDIS_QUEUE_PORT` | 6380 | — | — |
| `S3_PORT` | 9000 | `CLICKHOUSE_HTTP_PORT` | 8123 |
| `MINIO_CONSOLE_PORT` | 9001 | `CLICKHOUSE_NATIVE_PORT` | 9002 |

**Nothing inside the network changes when you override one**, because only the left-hand side moves.
`alloy.config.alloy` still says `loki:3100` regardless of `LOKI_PORT`.

One default is already non-obvious: ClickHouse's native port is 9002 because MinIO owns 9000.

---

## Healthchecks and `depends_on`

Every long-running service but one has a healthcheck, because `depends_on` alone only waits for a
container to *start*, not to be *usable*. MinIO is the exception — see below.

```yaml
depends_on:
  minio-init: { condition: service_completed_successfully }
  loki:       { condition: service_healthy }
```

Four of the probes are worth knowing:

**MinIO** has no probe, having had two that could not run. `mc ready local` needed a binary the
server image does not ship, and the `local` alias it named is created by `minio-init` — which was
itself waiting on that healthcheck. `curl -sf /minio/health/live` replaced it and lasted until the
image did: the community rebuild that took over from the withdrawn `minio/minio` ships no `curl`
either, so the container sat unhealthy while the server logged that it was serving.

The third version does not guess at the image's contents. `minio-init` retries `mc alias set` until
the API answers, which is a real readiness check — it is the first thing that has to work anyway —
and it depends on no binary being present anywhere except the `mc` this project chose. `minio` is
consequently the one long-running service `compose-wait.mjs` passes on `running` alone.

**Alloy** uses `bash`'s `/dev/tcp` — its image ships neither `wget` nor `curl`, a fact discovered by
the healthcheck failing rather than by reading the Dockerfile. It proves Alloy is listening, not that
every component loaded.

**ClickHouse** uses `127.0.0.1`, not `localhost`. It listens on IPv4 only while busybox `wget`
resolves `localhost` to `::1` first, so the `localhost` form is refused from inside the container and
the service never reports healthy.

**Loki** gets twenty retries rather than ten, because it waits on `minio-init` and a cold image pull
makes that slow.

---

## Checking it

```bash
docker compose -f infra/docker-compose.yml --profile '*' config --quiet   # valid?
docker compose -f infra/docker-compose.yml --profile '*' config --services # what would run
docker network inspect ratchet_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

`config` resolves variables, applies `.env`, and validates the schema without starting anything — it
is the fastest way to check an edit, and it is what CI should run if this file ever grows.

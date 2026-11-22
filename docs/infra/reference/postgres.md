---
title: postgres
description: The source of truth — the pgvector image, the three extensions, and why the init script runs exactly once.
---

# `postgres`

Owns anything a transaction depends on or a user reads right after writing: domain rows, RBAC, the
audit trail, auth tables and embeddings.

| | |
| --- | --- |
| **Image** | `pgvector/pgvector:pg17` |
| **Inside the network** | `postgres:5432` |
| **From the host** | `localhost:15432` |
| **Credentials** | `ratchet` / `ratchet`, database `ratchet` |
| **Volume** | `pgdata` |
| **Config file** | `postgres.init.sql` |

**Why this image:** stock Postgres 17 with `vector` available to enable — the official image plus a
self-built pgvector means building an image on every machine and CI runner. **17 over 16** for its
`VACUUM` memory behaviour, which matters most on the activity log (whose real answer is monthly
partitioning and retention from the first migration).

---

## `postgres.init.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Mounted at `/docker-entrypoint-initdb.d/01-extensions.sql`; the `01-` prefix is the entrypoint's sort
order, kept for a future second file.

- **`vector`** — the vector store's `vector(1536)` column does not exist without it; on stock Postgres
  the migration fails with an error reading like a typo.
- **`pg_stat_statements`** — answers "which query" before any scaling move. Needs
  `shared_preload_libraries=pg_stat_statements` (set by the compose `command`); the flag without the
  extension gives an absent view, not an error.
- **`pg_trgm`** — trigram fuzzy search (`WHERE name % 'searchterm'`). Every product wants it, and
  enabling it later takes a lock on a live database. Free until used.
- **`uuid-ossp`** — belt-and-braces: ids come from `Uuid.v7()` in code, but a repair script that
  invents an id should not need Node.

> **`"uuid-ossp"` is quoted for the hyphen** — unquoted it parses as `uuid - ossp` and the syntax
> error names neither.

**The init script runs only on an empty data directory** — the most common confusion: editing it and
restarting does nothing.

```bash
# apply a change to an existing volume
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U ratchet -d ratchet -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# or start over
pnpm infra:reset
```

> Address the container by **service name** (`postgres`), not a substituted container ID — the
> commands then work identically in PowerShell and bash.

---

## Who connects, and how

| Consumer | Reaches it at | For |
|---|---|---|
| `apps/web`, `apps/worker` (host) | `localhost:16432` | everything, via `DATABASE_URL` — **through [pgBouncer](pgbouncer.md)** |
| `migrate.ts`, `seed.ts`, `drizzle-kit` (host) | `localhost:15432` | DDL, via `DATABASE_DIRECT_URL` |
| `migrate.ts`, `partitions.ts`, under the `sharded` profile | `localhost:15433` | the same DDL on node 1, via `DATABASE_SHARD_1_DIRECT_URL` |
| `PgPartitionArchiveGateway` | `localhost:15432` | `DETACH … CONCURRENTLY` and a month-long stream |

**Two hostnames for one database**, by which side of the bridge the client is on — a container using
`localhost:15432` reaches its own loopback.

Each process pools `DATABASE_POOL_MAX` connections (10 by default), counted against pgBouncer *client*
slots (`MAX_CLIENT_CONN`, 1000), not `max_connections`; Postgres sees `DEFAULT_POOL_SIZE` (20). That is
why the pooler is in the core stack. `max_connections` is 200, set by the compose `command` with
`shared_preload_libraries=pg_stat_statements` and `track_io_timing=on`; size it as
`DEFAULT_POOL_SIZE × databases × pooler instances` plus superuser and `RESERVE_POOL_SIZE` headroom.

**`DATABASE_DIRECT_URL` is required in a pooled deployment.** Migrations, the seed, `drizzle-kit` and
the archive's `DETACH … CONCURRENTLY` need a pooler-free connection, and migration `0022`'s timeout
floor reaches pooled sessions only once server connections are recycled with `RECONNECT`.

---

## One container is the catalog and node 0 at once

Deliberately one Postgres. The app reaches it through a `DatabaseCluster` and a key, every table is
`catalog`, `local` or `routed`, and every tenant's `shard_assignments` row names node 0 — so routing
runs for real on one machine, and a second node is two environment variables. `pnpm infra:up:sharded`
starts `postgres-shard-1` and `pgbouncer-shard-1` on `:5433`/`:6433` (same image and init script, own
volume) for rehearsing the split, which `tests/smoke/sharded.smoke.spec.ts` exercises. See
[sharding](../../../packages/infrastructure/docs/reference/sharding.md) and [compose](compose.md).
**`pgvector` must be on every node** — hence the shared init script; a routed embedding column on a
node without it fails at insert, not boot.

---

## Checking it

```bash
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U ratchet -d ratchet -c "SELECT extname FROM pg_extension;"
```

`vector`, `pg_trgm`, `uuid-ossp` beside `plpgsql`; a missing `vector` means the volume predates the
script.

```bash
docker compose -f infra/docker-compose.yml exec postgres pg_isready -U ratchet -d ratchet
```

The same command the healthcheck runs.

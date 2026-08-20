# 11 · Local Infrastructure

> Postgres 17 with pgvector, Redis, and MinIO as the S3 stand-in. Three containers, one command.

**Delivers:** A running local stack that `db`, `infrastructure`, and `auth` can all connect to.

**Prerequisite:** [10 · `@loadbearing/contracts`](10-contracts-package.md)

---

## Step 11.1 — The compose file

**`infra/docker-compose.yml`**

```yaml
name: ratchet

services:
  postgres:
    image: pgvector/pgvector:pg17
    restart: unless-stopped
    environment:
      POSTGRES_USER: ratchet
      POSTGRES_PASSWORD: ratchet
      POSTGRES_DB: ratchet
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ratchet -d ratchet"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ratchet
      MINIO_ROOT_PASSWORD: ratchetsecret
    ports: ["9000:9000", "9001:9001"]
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ratchet ratchetsecret &&
      mc mb --ignore-existing local/ratchet &&
      mc anonymous set none local/ratchet &&
      echo 'bucket ready'
      "

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### Why each choice

**`pgvector/pgvector:pg17`** is stock Postgres 17 with the vector extension available to enable. Using the official image and installing pgvector yourself works, but pins you to building an image on every developer machine and every CI runner. Postgres 17 rather than 16 for the improved `VACUUM` memory behaviour, which matters on the activity log more than anywhere else.

**`--maxmemory-policy noeviction` on Redis is deliberate and important.** Redis here is doing three jobs — cache, session secondary store, and BullMQ backing store — and only one of them is disposable. Under the default `allkeys-lru`, memory pressure silently evicts queued jobs. `noeviction` makes Redis return an error instead, which is loud and recoverable. If you later separate cache from queue onto two Redis instances, the cache one can use LRU.

**`minio-init` is a one-shot container**, not a long-running service. It creates the bucket and exits. Without it, every developer's first upload fails with `NoSuchBucket` and they go looking for a code bug. `mc anonymous set none` makes the bucket private, which is the correct default — files are served through presigned URLs from `S3StorageGateway`, never by public path.

**Healthchecks on all three.** The web app and worker both connect on boot; without healthchecks, `pnpm dev` immediately after `pnpm infra:up` races Postgres's startup and fails with a connection error that looks like a config problem.

---

## Step 11.2 — Enable pgvector

The extension ships in the image but is not enabled in the database. Create an init script so a fresh volume enables it automatically.

**`infra/postgres/init/01-extensions.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

`vector` for embeddings ([14](14-vector-store.md)). `pg_trgm` for fuzzy text search, which every product ends up wanting and which is far cheaper to enable now than in a migration later. `uuid-ossp` is belt-and-braces — IDs are generated in application code by `Uuid.v7()`, but having the extension available means a data-repair SQL script does not need a round trip through Node.

> **Scripts in `/docker-entrypoint-initdb.d` run only when the data directory is empty.** If your volume already exists, they will not run. Either `pnpm infra:reset` (destroys data) or run the statements manually — Step 11.3.

---

## Step 11.3 — Start it

```bash
pnpm infra:up
```

```bash
docker compose -f infra/docker-compose.yml ps
```
> All three should read `healthy`. `minio-init` should read `exited (0)` — that is success, not a failure.

If your Postgres volume predates the init script:

```bash
docker compose -f infra/docker-compose.yml exec postgres psql -U ratchet -d ratchet -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
> Addressing the container by **service name** (`postgres`) rather than a shell-substituted container ID is what makes this work identically in PowerShell and bash.

---

## Step 11.4 — Verify each service

```bash
docker compose -f infra/docker-compose.yml exec postgres psql -U ratchet -d ratchet -c "SELECT extname FROM pg_extension;"
```
> Should list `vector`, `pg_trgm`, and `uuid-ossp` alongside `plpgsql`.

```bash
docker compose -f infra/docker-compose.yml exec redis redis-cli ping
```
> `PONG`.

Open `http://localhost:9001` and sign in with `ratchet` / `ratchetsecret`. The `ratchet` bucket should be listed and empty.

---

## Step 11.5 — Useful operations

```bash
pnpm infra:down
```
> Stops the containers. Volumes survive, so your data is intact.

```bash
pnpm infra:reset
```
> `down -v` — stops containers **and destroys the volumes**. This is the "give me a clean database" button, and it re-runs the init scripts on next start. It is also irreversible, which is why it is a separate script from `infra:down` rather than a flag someone adds by muscle memory.

```bash
docker compose -f infra/docker-compose.yml logs -f postgres
```

---

## What production looks like

Nothing in the application code changes. These containers are development conveniences; the configuration in `.env` is what points elsewhere.

| Local | Production |
|---|---|
| `pgvector/pgvector:pg17` container | Managed Postgres with the `vector` extension enabled — RDS, Cloud SQL, Neon, Supabase |
| `redis:7-alpine` container | Managed Redis — ElastiCache, Upstash, Redis Cloud. **Two instances**: one for cache (LRU eviction), one for BullMQ (`noeviction`) |
| MinIO | S3, R2, or any S3-compatible store. Set `S3_FORCE_PATH_STYLE=false` for AWS |

That last row is the reason MinIO is here rather than a local filesystem stand-in: the AWS SDK talks to MinIO unchanged, so the code path exercised in development is the code path that runs in production. A filesystem adapter would mean the S3 path is first executed on the day you deploy.

The `S3_FORCE_PATH_STYLE` switch already exists in `.env.example` from [02](02-repo-skeleton.md). MinIO needs path-style addressing (`endpoint/bucket/key`); AWS wants virtual-host style (`bucket.endpoint/key`). Having it as a config value rather than a code branch is what makes the difference one line in an environment file.

---

## ✅ Gate

- `docker compose -f infra/docker-compose.yml ps` shows postgres, redis, and minio all `healthy`.
- `SELECT extname FROM pg_extension;` includes `vector`.
- The MinIO console at `http://localhost:9001` shows a `ratchet` bucket.

Do not proceed until this passes.

---

[← `@loadbearing/contracts`](10-contracts-package.md) · [`@loadbearing/application` →](12-application-package.md)

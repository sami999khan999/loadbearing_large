# loadbearing

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis (cache + queue) · S3 · stdout to Loki · ClickHouse behind a driver flag

## Getting started

    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"
    pnpm infra:up
    pnpm db:migrate && pnpm db:seed
    pnpm dev

Web: http://localhost:3000 · Loki API: http://localhost:3100 · MinIO console: http://localhost:9001

`pnpm infra:up` starts Postgres, two Redis instances (cache and queue, deliberately separate), MinIO,
and the Loki/Alloy log pipeline. ClickHouse sits behind `pnpm infra:up:analytics` and is not started
by default. See [docs/setup/11](docs/setup/11-local-infrastructure.md).

**Two stores are wired but off.** ClickHouse (`AnalyticsReader`, `AnalyticsProjector`) and Loki's read
side (`LogReader`) have working adapters, a projection consumer, and a nightly reconciliation — and
the container builds none of them unless `CLICKHOUSE_URL` / `LOKI_URL` are set. *The seam being
implemented* and *the store being started* are separate decisions, and only the second costs anything
to be wrong about. See
[reference/clickhouse](packages/infrastructure/docs/reference/clickhouse.md).

## Documentation

- **[`docs/setup/`](docs/setup/00-README.md)** — the build order, walked once. Thirty-one steps from
  an empty directory to a running app.
- **[`docs/opinions/`](docs/opinions/index.md)** — the reference, consulted continually. Every rule
  for what to call a thing, where to put it, and which store owns it.
- **`packages/*/docs/`** — one reference set per package: what it is for, and why each export is
  shaped the way it is.
- **[`infra/docs/`](infra/docs/index.md)** — the running stack: what each container is for, how the
  log pipeline works, and what to check when it is wrong.

# loadbearing

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis (cache + queue) · S3 · stdout to Loki

## Getting started

    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"
    pnpm infra:up
    pnpm db:migrate && pnpm db:seed
    pnpm dev

Web: http://localhost:3000 · Grafana: http://localhost:3001 · MinIO console: http://localhost:9001

`pnpm infra:up` starts Postgres, two Redis instances (cache and queue, deliberately separate), MinIO,
and the Loki/Alloy/Grafana log stack. ClickHouse sits behind `pnpm infra:up:analytics` and is not
started by default. See [docs/setup/11](docs/setup/11-local-infrastructure.md).

## Documentation

- **[`docs/setup/`](docs/setup/00-README.md)** — the build order, walked once. Thirty-one steps from
  an empty directory to a running app.
- **[`docs/opinions/`](docs/opinions/index.md)** — the reference, consulted continually. Every rule
  for what to call a thing, where to put it, and which store owns it.
- **`packages/*/docs/`** — one reference set per package: what it is for, and why each export is
  shaped the way it is.

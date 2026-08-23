# loadbearing

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis · S3

## Getting started

    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"
    pnpm infra:up
    pnpm db:migrate && pnpm db:seed
    pnpm dev

Web: http://localhost:3000 · MinIO console: http://localhost:9001

## Documentation

- **[`docs/setup/`](docs/setup/00-README.md)** — the build order, walked once. Thirty-one steps from
  an empty directory to a running app.
- **[`docs/opinions/`](docs/opinions/index.md)** — the reference, consulted continually. Every rule
  for what to call a thing and where to put it.
- **`packages/*/docs/`** — one reference set per package: what it is for, and why each export is
  shaped the way it is.

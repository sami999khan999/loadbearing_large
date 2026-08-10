# ratchet

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis · S3

## Getting started

    corepack enable
    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"
    pnpm infra:up
    pnpm db:migrate && pnpm db:seed
    pnpm dev

Web: http://localhost:3000 · MinIO console: http://localhost:9001

See `docs/` for the architecture and the build order.

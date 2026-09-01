---
title: Layering
description: The one-way dependency graph, the server-only boundary, and where a concrete adapter may be named.
---

# Layering

Dependencies point one way. A package may import from anything to its left, never to its right.

```
errors → core → permissions · observability → contracts → application → infrastructure → auth → composition
                                                                                                     ↓
                                    asset → ui · content → api-client → query → feature → apps/{web,worker}
```

- **`packages/application` is the domain.** It names **no framework** — no `@orpc/*`, `@tanstack/*`,
  `@nestjs/*`, `drizzle-orm`, `ioredis`, `bullmq`, `@aws-sdk/*`, `better-auth`, `pg`, `express`,
  `fastify`, `hono` — and it **never logs** (no `@loadbearing/observability` import). Both are CI
  assertions, not conventions.
- **`packages/infrastructure` is organised by vendor**, not capability: `pg/`, `redis/`, `s3/`,
  `bullmq/`, `openai/`, `clickhouse/`, `loki/`, `smtp/`. `rm -r src/clickhouse/` is the complete
  answer to a swap. Naming by capability breaks the moment a port gets a second implementation.
- **`packages/composition` is the DI root** — the only place a concrete adapter is named.
- **`apps/*` are thin, deletable, framework-shaped.** Business logic never lands there.

### Server-only boundary

These are a Biome error inside `packages/{ui,feature,query,errors}` and `apps/*/src`:
`@loadbearing/{infrastructure,auth,composition,application}`, `drizzle-orm`, `pg`, `ioredis`,
`bullmq`, `better-auth`.

Cross the boundary via `@loadbearing/contracts`. The ban lifts in `apps/web/src/server/**` and any
`*.server.ts`, which is what makes those paths the seam.

`"use client"` appears **only** in `ui`, `query`, `feature`. Marking an isomorphic package
client-only breaks SSR of translated copy and authorization inside a server component.

---

**The argument.**

- [`docs/opinions/folders.md`](../../opinions/folders.md) — role vs subject folders, and which package is which kind.
- [`docs/opinions/dependencies.md`](../../opinions/dependencies.md) — which layer may name a framework.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**

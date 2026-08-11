# Starter Kit — Build Order

> The reusable foundation every project on this architecture starts from. Postgres + Drizzle, Redis, S3, Better Auth, pgvector behind a swappable seam, and the fourteen-package layout from the architecture docs — with **no product features in it**.

**Stack:** pnpm workspaces (no Turborepo) · TanStack Start + oRPC · standalone worker · Postgres 17 + pgvector · Redis · S3 (MinIO locally) · Better Auth
**Paradigm:** strictly object-oriented everywhere except React components and hooks.

---

## How to use these documents

Work through them **in order**. Each one ends with a **✅ Gate** — a concrete, checkable condition. The order is a real dependency chain: `core → permissions → contracts → application → db → infrastructure → auth → composition → api-client → asset → content → query → ui → feature → apps`. pnpm derives build ordering from the workspace graph, so nothing declares it.

Nothing here creates a feature. When you finish [26](26-verification-and-first-feature.md) you have a repo that boots, authenticates, stores files, caches, embeds, and enforces permissions — and contains zero business logic. Feature 01 is then the first thing you write on top.

| Symbol | Meaning |
|---|---|
| **Create file X** | Make it in your editor and paste the contents. No shell heredocs, so nothing is OS-specific. |
| Fenced `bash` block | A command. `pnpm`, `git`, `docker`, and `node` behave identically on Windows, macOS, and Linux. |
| **✅ Gate** | Do not proceed until this passes. |

---

## The sequence

### Phase A — the repo exists

| # | File | Delivers |
|---|---|---|
| 01 | [Prerequisites](01-prerequisites.md) | Node 24, pnpm 11, Docker, Git configured for a mixed-OS team |
| 02 | [Repository Skeleton](02-repo-skeleton.md) | Four top-level folders, six root files, first commit |
| 03 | [Workspace & Catalogs](03-workspace-and-catalogs.md) | `pnpm install` succeeds; topological scripts replace Turborepo |
| 04 | [TypeScript Configs](04-typescript-configs.md) | Four shared `tsconfig` bases |
| 05 | [Lint & Format](05-lint-and-format.md) | Prettier, and the ESLint rules that mechanically enforce OOP + the server-only boundary |
| 06 | [Package Anatomy](06-package-anatomy.md) | The shape every package copies, and the one-shot scaffold script |

### Phase B — the shared kernel

| # | File | Delivers |
|---|---|---|
| 07 | [`@ratchet/core`](07-core-package.md) | `Result`, `Clock`, `Uuid`, `ServerOnly` |
| 08 | [`@ratchet/permissions`](08-permissions-package.md) | `PermissionRegistry`, `ModuleRegistry`, `CapabilitySet` |
| 09 | [`@ratchet/contracts`](09-contracts-package.md) | Zod contract classes, entities, oRPC contract router, `ProcedurePermissions` |

### Phase C — the server side

| # | File | Delivers |
|---|---|---|
| 10 | [Local Infrastructure](10-local-infrastructure.md) | Postgres + pgvector, Redis, MinIO, and the bucket |
| 11 | [`@ratchet/application`](11-application-package.md) | `Principal`, `Authorizer`, domain errors, **every port** — zero framework imports |
| 12 | [`@ratchet/db`](12-db-package.md) | Drizzle, migrations, repositories, seeds |
| 13 | [Vector Storage](13-vector-store.md) | `VectorStore` port + `PgVectorStore`, sized so Qdrant is a one-line swap |
| 14 | [`@ratchet/infrastructure`](14-infrastructure-package.md) | Redis cache, S3 storage gateway, BullMQ queue publisher |
| 15 | [`@ratchet/auth`](15-auth-package.md) | Better Auth, `PrincipalBuilder`, capability cache, API keys |
| 16 | [`@ratchet/composition`](16-composition-container.md) | The `Container` DI root |

### Phase D — the client side

| # | File | Delivers |
|---|---|---|
| 17 | [`@ratchet/api-client`](17-api-client-package.md) | oRPC client + `AuthStrategy` — React-free |
| 18 | [`@ratchet/asset`](18-asset-package.md) | Every binary: images, icon sprite, fonts |
| 19 | [`@ratchet/content`](19-content-package.md) | Messages, documents, collections, `ContentSource` |
| 20 | [`@ratchet/query`](20-query-package.md) | The single TanStack owner: keys, options, client factory |
| 21 | [`@ratchet/ui`](21-ui-package.md) | Design system with no domain nouns |
| 22 | [`@ratchet/feature`](22-feature-package.md) | Components that fetch and mutate |

### Phase E — the apps and the seal

| # | File | Delivers |
|---|---|---|
| 23 | [`apps/web`](23-web-app.md) | TanStack Start, oRPC handler, auth handler, route + UI gating |
| 24 | [`apps/worker`](24-worker-app.md) | BullMQ consumers and repeatable schedules |
| 25 | [Hygiene & CI](25-hygiene-and-ci.md) | Hooks, commit scopes, pipeline, bundle-leak assertion |
| 26 | [Verification & First Feature](26-verification-and-first-feature.md) | Architecture checks, commit sequence, the add-a-module checklist |

### Reference and optional extras

| # | File | Delivers |
|---|---|---|
| 27 | [Folder Structure](27-folder-structure.md) | The complete tree after step 26, on one page |
| 28 | [Naming & Boundaries](28-naming-and-boundaries.md) | Every naming rule, what each folder does and doesn't do, one feature traced end to end |
| 29 | [`apps/desktop`](29-desktop-app.md) | Tauri: one app directory, zero new packages |

---

## The fourteen packages, in one paragraph

`core` holds primitives. `permissions` decides who may do what. `contracts` defines what data looks like and what it knows about itself. `application` holds every operation the product can perform plus the abstract ports it needs, with no framework anywhere. `db` implements the Postgres side of those ports. `infrastructure` implements the Redis, S3, and queue side. `auth` owns identity and turns any credential into a `Principal`. `composition` wires all of it together. `asset` holds every binary the product ships. `content` holds every user-visible string. `api-client` reaches the server, `query` caches what comes back, `ui` renders it, and `feature` assembles those into screens. The apps are thin adapters that read configuration, mount a transport, and compose components.

---

## Two deliberate departures from the architecture docs

Both are called out again where they happen. Read them now so they aren't a surprise.

**1. `packages/infrastructure` is a fourteenth package.** The architecture docs place concrete adapters in `db` "or in the app that constructs them." Neither works for Redis and S3: `db` means Postgres, and putting an S3 client in `apps/` duplicates it between `web` and `worker`. So non-Postgres adapters get one server-only package, exactly the way `auth` got one. If you would rather stay at thirteen, fold `infrastructure/src/cache/` and `infrastructure/src/storage/` into `db/src/` as sibling folders to `vector/` — every other line in these documents is unchanged.

**2. `VectorStore` is declared in `application/port/`, not in `db`.** The architecture docs put the abstract class in `packages/db/src/vector/`. That works only while the implementation is Postgres. Your requirement is to move to a dedicated vector database later without rewrites, and a use-case cannot depend on `db` — so the abstraction has to sit where every other port sits. `PgVectorStore` still lives in `db/src/vector/`. See [13](13-vector-store.md).

---

## If you only remember six things

1. **Everything that matters lives in `packages/`.** `apps/` holds framework code and nothing else.
2. **Authorization lives in the use-case**, not in transport middleware. Middleware is bypassed by the worker and by SSR direct calls; `Authorizer.assert()` isn't.
3. **Domain errors, never HTTP errors, in `@ratchet/application`.** `ForbiddenError` maps to `ORPCError('FORBIDDEN')` at the adapter.
4. **No package reads `process.env`.** Config is read once in an app and handed down as constructor arguments.
5. **Exactly one package imports `@tanstack/*`** — `query`. `api-client` stays React-free; `feature` may not import `api-client`.
6. **Server-only packages have three defences** — the ESLint boundary, the `ServerOnly.assert()` tripwire, and the CI bundle check.

---

## Renaming the scope

Every package is `@ratchet/*` so these documents line up with the architecture docs you already have. To rebrand the kit for a new project, change:

- the `name` field in each `packages/*/package.json` and `apps/*/package.json`
- the `@ratchet/` prefix in every import (one editor-wide find and replace)
- `noExternal: [/^@ratchet\//]` in `apps/web/vite.config.ts`
- the `group:` array in `tooling/eslint-config/react.js`
- `name: ratchet` and the credentials in `infra/docker-compose.yml`

Nothing else. Do it before the first commit, not after.

---

[Prerequisites →](01-prerequisites.md)

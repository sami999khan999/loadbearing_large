# 28 · Folder structure

> The complete tree after step 26, on one page. Use it to check what you built, and as the template for what you add next.

**Delivers:** Nothing new. This is a reference.

**Prerequisite:** [27 · Verification and first feature](27-verification-and-first-feature.md)

---

## How to read this

Files marked `→ Name` export a class of that name. Files marked `←` carry a note. Anything in `<angle-brackets>` is a per-slice pattern rather than a literal name — `<subject>` is `task`, `lead`, `invoice`, whatever you are building.

Two things this tree deliberately shows in full: **every `index.ts`**, because the barrel-per-folder rule is what keeps import paths stable, and **the two `env.ts` files**, because they are the only `process.env` readers in the repository.

`node_modules/`, `dist/`, and `.turbo`-style caches are omitted throughout.

---

## The whole repository

```
ratchet/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc                                     ← 24
├── .env.example
├── README.md
├── package.json                               ← devEngines.packageManager, scripts, devDeps only
├── pnpm-workspace.yaml                        ← members, catalog, allowBuilds, settings
├── pnpm-lock.yaml
├── biome.json                                 ← two lines; extends tooling/biome-config
├── eslint.config.js                           ← re-exports @loadbearing/eslint-config
├── commitlint.config.js                       ← closed scope-enum
├── .lintstagedrc.json
│
├── .husky/
│   ├── pre-commit                             ← pnpm exec lint-staged (biome only)
│   ├── pre-push                               ← pnpm exec eslint .
│   └── commit-msg                             ← pnpm exec commitlint
│
├── .github/
│   └── workflows/
│       └── ci.yml                             ← postgres + redis services, 5 steps
│
├── infra/
│   ├── docker-compose.yml                     ← pgvector/pg17, redis, minio, minio-init
│   └── postgres/
│       └── init/
│           └── 01-extensions.sql              ← vector, pg_trgm, uuid-ossp
│
├── tooling/                                   ← 3 workspace packages, changed rarely
│   ├── tsconfig/
│   │   ├── package.json                       ← @loadbearing/tsconfig, exports map
│   │   ├── docs/
│   │   └── src/
│   │       ├── base.json                      ← ES2024, no DOM
│   │       ├── library.json                   ← for packages/*
│   │       ├── node-esm.json                  ← for apps/worker
│   │       └── react.json                     ← adds DOM + jsx
│   ├── biome-config/
│   │   ├── package.json                       ← @loadbearing/biome-config
│   │   ├── docs/
│   │   └── src/
│   │       └── base.json                      ← format, import order, lint, boundaries
│   ├── eslint-config/
│   │   ├── package.json                       ← @loadbearing/eslint-config
│   │   ├── docs/
│   │   └── src/
│   │       ├── index.js                       ← typed rules + OOP shape rules
│   │       └── types/index.d.ts               ← hand-written; no build to emit it
│   └── scripts/
│       └── check-architecture.mjs             ← the three CI greps
│
├── packages/                                  ← everything that matters
│   ├── core/
│   ├── errors/
│   ├── permissions/
│   ├── contracts/
│   ├── application/
│   ├── db/
│   ├── infrastructure/
│   ├── auth/
│   ├── composition/
│   ├── api-client/
│   ├── asset/
│   ├── content/
│   ├── query/
│   ├── ui/
│   └── feature/
│
└── apps/                                      ← thin, deletable, framework-shaped
    ├── web/
    ├── worker/
    └── desktop/
```

Expanded below, in build order.

---

## Every package has the same shape

**No lint config per package.** Biome and ESLint both run once from the root, keyed on file globs — so no package can quietly opt itself out of a rule.

```
packages/<name>/
├── package.json          ← name, exports (with the "development" condition), scripts
├── tsconfig.json         ← extends @loadbearing/tsconfig/library.json; includes src/** AND tests/**
├── tsup.config.ts        ← entry, dts, format: esm, target: es2024
├── vitest.config.ts      ← include: ["tests/**/*.spec.ts"]  (only where the package has tests)
├── src/
│   ├── index.ts          ← the public surface; nothing outside it is importable
│   ├── import.ts         ← the outside surface; absent when the package takes nothing
│   └── <role>/           ← everything else, in a folder named after its kind
│       └── index.ts      ←   one barrel per folder
├── tests/                ← every spec, mirroring the src/ tree it covers
└── docs/
    ├── meta.json         ← sidebar title, description, page order
    ├── index.md          ← the overview; plain Markdown, never MDX
    └── reference/        ← every page beyond the overview
        └── meta.json     ← group label and page order
```

**`src/` holds `index.ts`, `import.ts`, and folders — never a loose third file.** The folder is
named after the kind of thing inside it (`error/`, `catalog/`, `registry/`, `transport/`,
`primitive/`), and the same kind gets the same name in every package. Where a package's contents
repeat once per feature slice, the folder is named after the subject instead. The full rule, the
shared vocabulary, and the boundary between the two are in
[Opinions · Folders](../opinions/folders.md).

**Tests are never in `src/`.** Every spec lives under its package's own `tests/`, at the path its
subject has in `src/` — `src/error/app.error.ts` is covered by `tests/error/app.error.spec.ts`. That keeps `src/` equal to the shipped surface
(`tsup` builds from `src/index.ts`, and the `development` export condition resolves into `src/`),
while the mirrored path preserves the one thing colocation was good at — knowing where a subject's
test is without looking. Full rationale in [07](07-core-package.md#step-76--a-first-test).

The trees below are rooted at `src/`, so each package's specs appear in the `tests/` listing after
its tree rather than inside it. `*.stories.tsx` is **not** a test and stays in `src/` — see [22](22-ui-package.md).

Only deviations are noted from here on.

---

## Phase B — the shared kernel

### `packages/core`

```
packages/core/src/
├── index.ts
├── import.ts                    ← ServerOnlyError, from `errors`
└── primitive/
    ├── index.ts
    ├── clock.ts                 → Clock, SystemClock, FixedClock
    ├── result.ts                → Result, Ok, Err, Results
    ├── uuid.ts                  → Uuid
    └── server-only.ts           → ServerOnly   ← throws ServerOnlyError from `errors`

packages/core/tests/
└── primitive/
    ├── clock.spec.ts
    ├── result.spec.ts
    ├── server-only.spec.ts
    └── uuid.spec.ts
```

**One dependency: `@loadbearing/errors`.** `ServerOnly.assert` throws, and nothing here throws a bare `Error` ([09](09-errors-package.md) Step 9.3). `errors` is the root of the graph; `core` is one edge above it, and both are still zero-third-party and isomorphic.

### `packages/errors`

```
packages/errors/src/
├── index.ts                     ← no import.ts: this package takes nothing from outside
├── catalog/                     ← one fragment per slice, team-owned
│   ├── index.ts                 ←   ERROR_CATALOG, ErrorCode, ErrorMeta
│   └── core.errors.ts
├── error/                       ← the base class and one subclass per code with context
│   ├── index.ts
│   ├── app.error.ts             → AppError, ErrorEnvelope, FieldViolation, TransportError
│   ├── forbidden.error.ts       → ForbiddenError
│   ├── unauthorized.error.ts    → UnauthorizedError
│   ├── two-factor-required.error.ts → TwoFactorRequiredError
│   ├── not-found.error.ts       → NotFoundError
│   ├── conflict.error.ts        → ConflictError
│   ├── validation.error.ts      → ValidationError
│   ├── internal.error.ts        → InternalError
│   └── server-only.error.ts     → ServerOnlyError   ← thrown by core, at module load
├── normalizer/
│   ├── index.ts
│   └── error-normalizer.ts      → ErrorNormalizer
└── transport/
    ├── index.ts
    └── http.ts                  → HTTP_STATUS   ★ adapters only, never the domain

packages/errors/tests/
├── error/
│   ├── app.error.spec.ts
│   ├── server-only.error.spec.ts
│   └── validation.error.spec.ts
└── normalizer/
    └── error-normalizer.spec.ts
```

**The root of the graph.** Zero dependencies, because a failure has to be readable in the use-case that throws it, the transport that maps it, the component that renders it, and the worker that logs it — any dependency excludes one of those. `core` and `content` both depend on it; it depends on neither.

**`transport/http.ts` is the one file in this package the domain layer may not import.** `HTTP_STATUS` is a transport concern; a lint rule bans the import name for `packages/application/**` ([09](09-errors-package.md)).

**No message strings anywhere.** `Error.message` is the code; every word a user reads lives in `content` ([20](20-content-package.md)).

### `packages/permissions`

```
packages/permissions/src/
├── index.ts                     ← no import.ts: this package takes nothing from outside
├── registry/
│   ├── index.ts
│   ├── permission-registry.ts   → PermissionRegistry, PermissionKey, PermissionMeta
│   └── module-registry.ts       → ModuleRegistry, ModuleKey, ModuleGate
├── capability/
│   ├── index.ts
│   └── capability-set.ts        → CapabilitySet, CapabilitySetDto
├── catalog/                     ← one fragment per slice, team-owned
│   ├── index.ts                 ←   merges fragments (platform-owned)
│   ├── rbac.permissions.ts
│   └── <slice>.permissions.ts
├── gate/                        ← same pattern for nav gates
│   ├── index.ts
│   ├── rbac.gate.ts
│   └── <slice>.gate.ts
└── route/                       ← same pattern for destinations
    ├── index.ts                 ←   ROUTES, AppRoute, RoutePath
    ├── shell.routes.ts          ←   platform-owned: home, sign-in, forbidden
    ├── rbac.routes.ts
    └── <slice>.routes.ts

packages/permissions/tests/
├── registry/
│   ├── permission-registry.spec.ts
│   └── module-registry.spec.ts
├── capability/
│   └── capability-set.spec.ts
└── route/
    └── route.spec.ts
```

**The fragment folders are the team-ownership seam.** One team, one file, no merge conflicts in a shared catalog. All three follow it: a slice adds `<slice>.permissions.ts`, `<slice>.gate.ts`, and `<slice>.routes.ts`, and each platform-owned `index.ts` gains one spread line.

**`route/` holds every destination the product has**, hand-written and grouped by slice. It is here rather than in a shell because a router's generated route tree cannot be the shared source — a Nest process has none, and web, desktop, and Next each generate a different one ([08](08-permissions-package.md)).

### `packages/contracts`

```
packages/contracts/src/
├── index.ts
├── import.ts                        ← zod, @orpc/contract, @loadbearing/permissions
├── primitive/
│   ├── index.ts
│   ├── identifiers.ts               → Identifiers, GoalId, TaskId, UserId, …
│   ├── envelope.ts                  → Envelope
│   └── pagination.ts                → Pagination
├── procedure/
│   └── index.ts                     → contract, AppContract   ← merges every slice's procedures
├── catalog/
│   ├── index.ts                     → PROCEDURE_PERMISSIONS   ← merges every slice's fragment
│   └── <subject>.permissions.ts     ←   procedure path → PermissionKey
├── registry/
│   ├── index.ts
│   └── procedure-permissions.ts     → ProcedurePermissions
└── <subject>/                       ← one folder per domain subject; none ship yet
    ├── index.ts
    ├── <subject>.contract.ts        → <Subject>Contract   (zod shapes)
    ├── <subject>.entity.ts          → <Subject>Entity     (behaviour, no I/O)
    └── <subject>.procedures.ts      → <Subject>Procedures (oRPC, .route() mandatory)

packages/contracts/tests/
├── primitive/
│   ├── identifiers.spec.ts
│   ├── envelope.spec.ts
│   └── pagination.spec.ts
├── registry/
│   └── procedure-permissions.spec.ts  ← coverage + orphan tests, via ContractWalker
└── <subject>/
    └── <subject>.entity.spec.ts
```

---

## Phase C — the server side

### `packages/application`

```
packages/application/src/
├── index.ts
├── principal.ts                  → Principal
├── authorizer.ts                 → Authorizer
├── error/
│   ├── index.ts
│   ├── domain.error.ts           → DomainError (base, carries a `code` string)
│   ├── forbidden.error.ts        → ForbiddenError
│   ├── not-found.error.ts        → NotFoundError
│   ├── conflict.error.ts         → ConflictError
│   └── validation.error.ts       → ValidationError
├── port/                         ← abstract classes only, no implementations
│   ├── index.ts
│   ├── activity.logger.ts        → ActivityLogger
│   ├── cache.store.ts            → CacheStore
│   ├── embedding.provider.ts     → EmbeddingProvider
│   ├── event.bus.ts              → EventBus
│   ├── queue.publisher.ts        → QueuePublisher
│   ├── session.resolver.ts       → SessionResolver
│   ├── storage.gateway.ts        → StorageGateway
│   ├── unit-of-work.ts           → UnitOfWork
│   └── vector.store.ts           → VectorStore
└── <slice>/                      ← one folder per feature slice
    ├── index.ts
    ├── <slice>.repository.ts     → <Slice>Repository  (port, lives WITH its slice)
    ├── create-<slice>.use-case.ts
    └── reactivate-<slice>.use-case.ts

packages/application/tests/
└── <slice>/
    └── reactivate-<slice>.use-case.spec.ts
```

**Repository ports live in the slice, not in `port/`.** `port/` holds the cross-cutting infrastructure abstractions; a `TaskRepository` belongs next to the use-cases that need it.

**No framework imports anywhere in this tree** — `check-architecture.mjs` asserts it.

### `packages/db`

```
packages/db/
├── drizzle.config.ts
├── migrations/                        ← generated, committed, never pushed
│   ├── 0000_init.sql
│   ├── 0001_auth.sql                  ← Better Auth CLI output + hand-written FKs
│   ├── 0002_vector.sql
│   └── meta/
└── src/
    ├── index.ts                       ← ServerOnly.assert() on line two
    ├── database.ts                    → Database
    ├── schema.ts                      ← barrel re-exporting every *.schema.ts
    ├── base.repository.ts             → BaseRepository
    ├── unit-of-work.ts                → PgUnitOfWork
    ├── rbac/
    │   ├── index.ts
    │   ├── rbac.schema.ts             → roles, role_permissions, memberships, goal_members
    │   ├── auth.schema.ts             ← Better Auth CLI output, committed
    │   ├── api-key.schema.ts
    │   └── capability.repository.ts   → PgCapabilityRepository
    ├── activity/
    │   ├── index.ts
    │   ├── activity.schema.ts
    │   └── activity.logger.ts         → PgActivityLogger
    ├── vector/                        ← infrastructure, not a slice
    │   ├── index.ts
    │   ├── vector.schema.ts           ← HNSW index, cosine ops
    │   └── pg-vector.store.ts         → PgVectorStore
    ├── <slice>/
    │   ├── index.ts
    │   ├── <slice>.schema.ts
    │   └── pg-<slice>.repository.ts   → Pg<Slice>Repository
    └── seed/
        ├── index.ts
        └── system-role.seed.ts        ← idempotent
```

**`drizzle.config.ts` and `migrations/` sit above `src/`** because they are build-time artefacts, not shipped code.

**`grep -rn "PgVectorStore" packages/ apps/` must return hits in exactly two places** — here, and `composition/container.ts`. That is the seam that keeps a Qdrant swap cheap.

### `packages/infrastructure`

```
packages/infrastructure/src/
├── index.ts                              ← ServerOnly.assert()
├── redis/
│   ├── index.ts
│   └── redis.connection.ts               → RedisConnection
├── cache/
│   ├── index.ts
│   └── redis.cache-store.ts              → RedisCacheStore
├── storage/
│   ├── index.ts
│   ├── storage-key.ts                    → StorageKey
│   └── s3-storage.gateway.ts             → S3StorageGateway
├── queue/
│   ├── index.ts
│   ├── queue-name.ts                     → QueueName
│   └── bullmq.queue-publisher.ts         → BullMqQueuePublisher
└── embedding/
    ├── index.ts
    └── openai.embedding-provider.ts      → OpenAiEmbeddingProvider
```

**Every filename here leads with its technology.** That is the second naming exemption: `redis.cache-store.ts`, not `cache-store.redis.ts`. You should be able to see what you would delete when you swap a vendor.

### `packages/auth`

```
packages/auth/src/
├── index.ts                                 ← ServerOnly.assert()
├── auth.config.ts                           → AuthConfig
├── auth.factory.ts                          → AuthFactory.create(config)
├── session/
│   ├── index.ts
│   └── better-auth.session-resolver.ts      → BetterAuthSessionResolver
├── principal/
│   ├── index.ts
│   ├── principal.builder.ts                 → PrincipalBuilder
│   └── capability.cache.ts                  → CapabilityCache
└── apikey/
    ├── index.ts
    ├── api-key.hasher.ts                    → ApiKeyHasher
    └── api-key.resolver.ts                  → ApiKeyResolver

packages/auth/tests/
└── principal/
    └── capability.cache.spec.ts
```

### `packages/composition`

```
packages/composition/src/
├── index.ts                ← ServerOnly.assert()
├── container.config.ts     → ContainerConfig
├── container.ts            → Container
└── test-container.ts       → TestContainer   (fakes for every port)
```

**Three files, and the second-largest file in the repository.** Every wiring decision is here and nowhere else.

---

## Phase D — the client side

### `packages/api-client`

```
packages/api-client/src/
├── index.ts
├── api-client.ts                    → ApiClient  (private ctor; overHttp / inProcess)
└── auth/
    ├── index.ts
    ├── auth.client.ts               → AuthClient  (better-auth vanilla, never /react)
    ├── auth.strategy.ts             → AuthStrategy  (abstract)
    ├── cookie-auth.strategy.ts      → CookieAuthStrategy
    ├── bearer-auth.strategy.ts      → BearerAuthStrategy
    └── token.provider.ts            → TokenProvider  (abstract)
```

**No `react`, no `@tanstack/*`.** Enforced by `check:architecture` and by review — this package is not in the React glob, so the OOP rules apply to it.

### `packages/asset`

```
packages/asset/
├── build-sprite.mjs                   ← runs prebuild; fails on hardcoded fill/stroke
├── asset.d.ts                         ← module declarations for .svg / .webp / .woff2
└── src/
    ├── index.ts
    ├── image/
    │   ├── index.ts
    │   ├── image.manifest.ts          → ImageManifest, ImageKey  (closed union)
    │   └── file/
    │       ├── brand/logo.svg
    │       └── home/hero.webp
    ├── icon/
    │   ├── index.ts
    │   ├── icon-registry.ts           → IconRegistry, IconName   ← generated
    │   ├── sprite.svg                 ← generated, gitignored
    │   └── svg/
    │       ├── check.svg
    │       ├── chevron-down.svg
    │       └── user.svg
    └── font/
        ├── font.css                   ← self-hosted, font-display: swap
        └── inter-variable.woff2
```

Three entrypoints in `exports`: `.`, `./font.css`, `./sprite.svg`.

### `packages/content`

```
packages/content/src/
├── index.ts
├── import.ts                        ← ErrorCode, ErrorEnvelope, FieldViolation from `errors`
├── primitive/
│   ├── index.ts
│   └── locale.ts                    → Locale, Locales
├── source/
│   ├── index.ts
│   ├── content-source.ts            → ContentSource  (abstract, all methods async)
│   ├── static.content-source.ts     → StaticContentSource   ← split; dynamic import
│   └── bundled.content-source.ts    → BundledContentSource  ← every locale, static
├── translator/
│   ├── index.ts
│   ├── translator.ts                → Translator, MessageSnapshot
│   └── message-store.ts             → MessageStore  (the SSR → client carrier)
├── media/
│   ├── index.ts
│   ├── media-ref.ts                 → MediaRef
│   └── static.media-resolver.ts     → StaticMediaResolver
├── message/                         ── shape 1: short keyed strings
│   ├── index.ts
│   ├── namespace.ts                 ← MessageKey closed union, from type-only imports
│   ├── catalog.ts                   → CLIENT_CATALOG  (locale × namespace → loader)
│   ├── catalog.server.ts            → SERVER_CATALOG  (+ email)
│   ├── error-copy.ts                → ERROR_COPY, FIELD_RULE_COPY, ErrorCopy
│   ├── en/                          ← no index.ts; nothing merges these
│   │   ├── common.ts
│   │   ├── nav.ts
│   │   ├── auth.ts
│   │   ├── error.ts
│   │   └── email.ts                 ← the worker's namespace, server-only
│   └── bn/                          ← same five files; NamespaceBundle<N> each
│       ├── common.ts
│       ├── nav.ts
│       ├── auth.ts
│       ├── error.ts
│       └── email.ts
├── document/                        ── shape 2: long-form editorial
│   ├── index.ts
│   ├── document.schema.ts           → DocumentContract
│   └── document.entity.ts           → DocumentEntity
└── collection/                      ── shape 3: repeating records
    ├── index.ts
    ├── collection.schema.ts         → CollectionContract
    └── nav/
        ├── index.ts
        ├── nav.schema.ts            → NavContract   (carries `module`, never `permission`)
        └── nav.data.ts              → navItems

packages/content/tests/
├── primitive/
│   └── locale.spec.ts
├── source/
│   └── static.content-source.spec.ts  ← the shell arrives unasked; English is the fallback
├── translator/
│   ├── translator.spec.ts
│   └── message-store.spec.ts
└── message/
    └── error-copy.spec.ts             ← every ErrorCode has copy; every rule name resolves
```

> [!NOTE]
> **This tree is the finished package; the error slice of it is what exists today.** `locale.ts`,
> `translator.ts`, `message/error-copy.ts`, `message/namespace.ts`, `message/catalog.ts`, the
> `common` and `error` namespaces in both locales, and `content-source.ts` +
> `static.content-source.ts` far enough to hand out a `Translator` were written early, because
> [09](09-errors-package.md) has no other half. [20](20-content-package.md) marks each file and
> lists what the second pass adds.

### `packages/query`

```
packages/query/src/
├── index.ts
├── query-key.ts                   → QueryKeys       (mirrors procedure paths)
├── query-client.ts                → createQueryClient()
├── api-client.context.tsx         → ApiClientProvider, useApiClient
├── use-app-mutation.ts            → useAppMutation   (declarative `invalidates`)
├── session/
│   ├── index.ts
│   ├── session.queries.ts         → SessionQueries
│   └── session.mutations.ts       → SessionMutations
└── <slice>/
    ├── index.ts
    ├── <slice>.queries.ts         → <Slice>Queries   (queryOptions factories)
    └── <slice>.mutations.ts       → <Slice>Mutations
```

**The only package that may import `@tanstack/*`** — and still not `@tanstack/react-router`.

### `packages/ui`

```
packages/ui/src/
├── index.ts
├── token/
│   ├── index.ts
│   └── token.css                  ← spacing, radii, motion; imports @loadbearing/asset/font.css
├── theme/
│   ├── index.ts
│   ├── theme-registry.ts          → ThemeRegistry, ThemeKey
│   ├── theme.css                  ← [data-theme="…"] custom properties
│   └── font-registry.ts           → FontRegistry, FontKey
├── icon/
│   ├── index.ts
│   └── icon.tsx                   → Icon
├── can/
│   ├── index.ts
│   └── can.tsx                    → Can
├── data-table/
│   ├── index.ts
│   ├── data-table.tsx             → DataTable
│   └── data-table.stories.tsx
├── dialog/
├── empty-state/
└── status-badge/
```

**Colours live in `theme.css`, not `token.css`** — that separation is what makes a second theme a file rather than a refactor.

**No domain nouns and no router.** A `TaskCard` here is a bug; it belongs in `feature`.

### `packages/feature`

```
packages/feature/src/
├── index.ts
├── i18n/
│   ├── index.ts
│   └── message.context.tsx            → MessageProvider, useMessages
├── auth/
│   ├── index.ts
│   ├── sign-in.form.tsx               → SignInForm
│   ├── two-factor.form.tsx            → TwoFactorForm
│   ├── session.guard.tsx              → SessionGuard
│   └── session.context.tsx            → SessionProvider, useSession, useCapabilities
├── rbac/
│   ├── index.ts
│   ├── permission-matrix.tsx          → PermissionMatrix
│   └── effective-permissions.inspector.tsx
└── <slice>/
    ├── index.ts
    └── <slice>-board.tsx              → <Slice>Board

packages/feature/tests/
└── <slice>/
    └── <slice>-board.spec.tsx
```

**May not import `api-client` and may not import `@tanstack/react-router`.** Both are Biome errors, from the `packages/feature/**` override in `biome.json` ([05](05-lint-and-format.md)).

---

## Phase E — the apps

### `apps/web`

```
apps/web/
├── package.json
├── tsconfig.json                       ← extends react.json
├── vite.config.ts                      ← development condition, ssr.noExternal
└── src/
    ├── env.ts                          → Env   ★ one of two process.env readers
    ├── router.tsx
    ├── server/                         ← THE ENTIRE TRANSPORT LAYER
    │   ├── container.ts                ← module-scope Container, one per process
    │   ├── auth.ts
    │   ├── rpc-client.ts               → createServerRpcClient(request)
    │   └── orpc/
    │       ├── base.ts                 → base, principalMiddleware, authed
    │       ├── error.interceptor.ts    → DomainError.code → ORPCError
    │       ├── app.router.ts           → appRouter  (mirrors `contract` exactly)
    │       └── <subject>.router.ts     → <Subject>Router  (three lines per procedure)
    └── route/
        ├── __root.tsx                  ← token.css, theme.css, all four providers
        ├── -guard.ts                   → RouteGuard   (hyphen = not a route)
        ├── -messages.ts                → MessageRouterContext  (module augmentation)
        ├── index.tsx
        ├── sign-in.tsx
        ├── forbidden.tsx
        ├── <slice>/
        │   └── index.tsx
        └── api/
            ├── rpc.$.ts                ← oRPC fetch handler
            └── auth/
                └── $.ts                ← Better Auth fetch handler
```

**`src/server/` is what moves to `apps/api` if NestJS ever arrives.** Nothing above or below it changes. That is the whole reason it is one directory instead of scattered through the routes.

### `apps/worker`

```
apps/worker/
├── package.json                        ← tsx watch; no bundler
├── tsconfig.json                       ← extends node-esm.json
└── src/
    ├── env.ts                          → Env   ★ the second and last process.env reader
    ├── main.ts                         ← top-level await, SIGTERM handling
    ├── worker-bootstrap.ts             → WorkerBootstrap
    ├── system-principal.ts             → SystemPrincipal  (narrow, explicit grants)
    ├── consumer/
    │   ├── embedding.consumer.ts       → EmbeddingConsumer
    │   └── <name>.consumer.ts
    ├── notification/
    │   └── digest.composer.ts          → DigestComposer  (the only email-namespace reader)
    └── schedule/
        └── cleanup.schedule.ts         → CleanupSchedule  (fixed jobId)
```

---

### `apps/desktop`

```
apps/desktop/
├── package.json                        ← @loadbearing/desktop
├── tsconfig.json
├── tauri.conf.json                     ← CSP: API origin in connect-src, nothing else
├── src-tauri/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       └── token.rs                    ← keychain commands, the only secret store
└── src/
    ├── config.ts                       → Config   ★ import.meta.env, NOT process.env
    ├── token-provider.ts               → TauriTokenProvider  (implements TokenProvider)
    ├── api.ts                          → ApiClient + QueryClient singletons
    ├── router.tsx                      ← memory or hash history, its own route tree
    └── route/
        └── -nav-routes.ts              ← asserts ROUTES exist in this tree
```

**No `env.ts`, and that is the interesting part.** There is no Node runtime in the webview, so `process.env` does not exist — configuration arrives through `import.meta.env` in `config.ts`. The "exactly two `process.env` readers" assertion in [26](26-hygiene-and-ci.md) therefore needs no new exemption for a third app ([30](30-desktop-app.md)).

---

## What the shape tells you

**Count the `index.ts` files.** Every folder has one, and nothing outside a package's root `index.ts` is importable. That is why moving a file inside a package never breaks a consumer.

**Then open one.** Every barrel names each symbol it publishes — `export { Clock, FixedClock, SystemClock } from "./clock.js"`, never `export *`, enforced by Biome's `noReExportAll` ([05](05-lint-and-format.md), [Opinions · Imports](../opinions/imports.md)). The `→ Name` annotations in the trees above are what a file *contains*; the barrel is what a package *publishes*, and those are deliberately allowed to differ. `packages/db/src/schema.ts` is the single exemption, because drizzle-kit consumes it and nothing else does.

**Notice what `apps/` does not contain.** No business logic, no schema, no permission decision, no domain error. Across three shells: two `env.ts` files, one `config.ts`, one transport directory, one bootstrap, and route files that compose. If any app directory grows past a few hundred lines of non-route code, something drifted downward that belongs in `packages/`.

**Three shells, still two `process.env` readers.** `web` and `worker` read the environment; `desktop` cannot, because a webview has no Node runtime. So the assertion in [26](26-hygiene-and-ci.md) holds at two without an exemption, and it holds for a reason rather than by convention.

**Notice the `<slice>` folders repeating.** `permissions/catalog/`, `contracts/<subject>/`, `application/<slice>/`, `db/<slice>/`, `query/<slice>/`, `feature/<slice>/`, `web/route/<slice>/`. Seven places, one glob per team: `packages/*/src/<slice>/**`. The eleven-step checklist in [27](27-verification-and-first-feature.md) is just this list, walked in dependency order.

**Notice the three `ServerOnly.assert()` markers** — `db`, `infrastructure`, `auth`, plus `composition`. Those four packages must never reach a browser bundle, and there are three independent defences saying so: the Biome import boundary, that runtime assertion, and the CI bundle grep.

---

## ✅ Gate

Your tree matches this one, allowing for slices you have and slices you don't.

---

[← Verification & First Feature](27-verification-and-first-feature.md) · [Naming & Boundaries →](29-naming-and-boundaries.md)

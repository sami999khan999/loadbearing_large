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
│       └── ci.yml                             ← postgres + two redis services, 5 steps
│
├── infra/
│   ├── docker-compose.yml                     ← 9 services, 2 profiles
│   ├── postgres.init.sql                      ← extensions
│   ├── loki.config.yml                        ← MinIO-backed, 30-day retention
│   ├── alloy.config.alloy                     ← the four-label pipeline
│   ├── clickhouse.init.sql                    ← analytics profile only
│   ├── logs/                                  (ignored)
│   └── docs/                                  ← index.md + reference/, one page per file
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
│       └── check-architecture.mjs             ← the ten CI greps
│
├── packages/                                  ← everything that matters
│   ├── core/
│   ├── errors/
│   ├── observability/
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
packages/observability/src/
├── index.ts
├── import.ts                        ← Clock, SystemClock, Uuid, ERROR_CATALOG, ErrorNormalizer
├── primitive/
│   ├── index.ts
│   ├── log-level.ts                 → LogLevel, LogLevels
│   └── correlation.ts               → Correlation, TraceId
├── catalog/                         ← one fragment per slice, team-owned
│   ├── index.ts                     ←   EVENT_CATALOG, EventCode, EventMeta
│   └── core.events.ts
├── event/
│   ├── index.ts
│   └── event-shape.ts               → EventShape, EventFields, LogFields, LogEntry
└── logger/
    ├── index.ts
    ├── logger.ts                    → Logger        (abstract seam)
    ├── json.logger.ts               → JsonLogger    ★ the one file allowed to call console
    ├── silent.logger.ts             → SilentLogger
    └── redactor.ts                  → Redactor

packages/observability/tests/
├── primitive/
│   ├── log-level.spec.ts
│   └── correlation.spec.ts
├── catalog/
│   └── catalog.spec.ts
└── logger/
    ├── logger.spec.ts
    └── redactor.spec.ts
```

**The diagnostic stream, kept strictly apart from the audit trail.** `ActivityLogger` writes business
facts to Postgres inside the transaction; this writes JSON to stdout and does not care if a line is
lost. `packages/application` does not depend on it — the domain layer does not log
([12](12-application-package.md)).

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
│   ├── analytics.reader.ts       → AnalyticsReader
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

### `packages/infrastructure`

Every concrete adapter the system owns, in one server-only package. The separate database package the
architecture docs describe was folded in here: the two were siblings with no edge between them, and
the split put one seam in two places.

```
packages/infrastructure/
├── drizzle.config.ts
├── migrations/                        ← generated, committed, never pushed
│   ├── 0000_*.sql                     ← hand-edited: PARTITION BY on the append-only tables
│   ├── 0001_*.sql                     ← auth tables + the FKs, all schema-declared
│   ├── 0002_*.sql
│   └── meta/
└── src/
    ├── index.ts                              ← ServerOnly.assert() above every export
    ├── import.ts                             ← every external symbol, vendor SDKs included
    ├── pg/
    │   ├── index.ts
    │   ├── primitive/
    │   │   ├── database.ts                   → Database, DrizzleClient
    │   │   └── base.repository.ts            → BaseRepository
    │   ├── schema/                           ← the one barrel drizzle-kit reads
    │   │   ├── index.ts
    │   │   ├── rbac.schema.ts                → roles, role_permissions, memberships, goal_members
    │   │   ├── auth.schema.ts                ← Better Auth CLI output, committed
    │   │   ├── api-key.schema.ts
    │   │   ├── activity.schema.ts            ← activity_log, partitioned monthly
    │   │   ├── analytics.schema.ts           ← rollup tables + activity_archive
    │   │   └── vector.schema.ts              ← HNSW index, cosine ops
    │   ├── repository/                       ← every adapter, one file each, flat
    │   │   ├── index.ts
    │   │   ├── pg-activity.logger.ts         → PgActivityLogger
    │   │   ├── pg-activity-archive.gateway.ts → PgActivityArchiveGateway
    │   │   ├── pg-activity-replay.reader.ts  → PgActivityReplayReader
    │   │   ├── pg-analytics.reader.ts        → PgAnalyticsReader
    │   │   ├── pg-api-key.repository.ts      → PgApiKeyRepository
    │   │   ├── pg-capability.repository.ts   → PgCapabilityRepository
    │   │   ├── pg-maintenance.gateway.ts     → PgMaintenanceGateway
    │   │   ├── pg-membership.reader.ts       → PgMembershipReader
    │   │   ├── pg-vector.store.ts            → PgVectorStore
    │   │   └── pg-<slice>.repository.ts      → Pg<Slice>Repository
    │   ├── transaction/
    │   │   ├── transaction-scope.ts          → TransactionScope
    │   │   └── pg-unit-of-work.ts            → PgUnitOfWork
    │   ├── migrate/index.ts                  ← the migration runner
    │   └── seed/system-role.seed.ts          ← idempotent
    ├── redis/
    │   ├── redis.connection.ts               → RedisConnection (cache + queue)
    │   └── redis.cache-store.ts              → RedisCacheStore
    ├── s3/
    │   ├── storage-key.ts                    → StorageKey
    │   └── s3-storage.gateway.ts             → S3StorageGateway
    ├── bullmq/
    │   ├── queue-name.ts                     → QueueName
    │   └── bullmq.queue-publisher.ts         → BullMqQueuePublisher
    ├── openai/
    │   └── openai.embedding-provider.ts      → OpenAiEmbeddingProvider
    ├── clickhouse/                           ← opt-in: built only when configured
    │   ├── clickhouse.connection.ts          → ClickHouseConnection
    │   ├── clickhouse.analytics-reader.ts    → ClickHouseAnalyticsReader
    │   └── clickhouse.analytics-projector.ts → ClickHouseAnalyticsProjector
    ├── loki/                                 ← opt-in: built only when LOKI_URL is set
    │   └── loki.log-reader.ts                → LokiLogReader
    └── smoke/index.ts                        ← the wiring check, against live containers
```

**`drizzle.config.ts` and `migrations/` sit above `src/`** because they are build-time artefacts, not
shipped code.

**Every folder under `src/` is an external system, and that is the only axis.** `ls src/` answers
"what does this package depend on?" in one line. Two consequences that look like inconsistencies and
are not:

- **`pg/repository/` is flat.** It was once `activity/`, `analytics/`, `rbac/`, `vector/` and
  `maintenance/`, each holding one or two files. A folder holding one file is a path, not a subject
  — and `pg/analytics/` beside `clickhouse/` reads as two different things, when what it is now that
  ClickHouse has an implementation is two implementations of one port.
- **`pg/schema/` groups tables rather than putting each beside the repository that reads it.**
  drizzle-kit needs one barrel naming every table, and `check-architecture.mjs` asserts that barrel
  is complete — an incomplete one passes typecheck, lint, build and every test, and is noticed only
  by drizzle-kit generating `DROP TABLE`.

**Every filename leads with its technology.** That is the second naming exemption:
`redis.cache-store.ts`, not `cache-store.redis.ts`. You should be able to see what you would delete
when you swap a vendor — and with the folders naming the vendor too, `rm -r src/clickhouse/` is the
complete answer.

**`grep -rn "PgVectorStore" packages/ apps/` must return hits in exactly two packages** — here, and
`composition` (twice there: `src/import.ts` and `src/container/container.ts`, since every external
symbol enters through the one outside surface). A third package naming it is what makes a vector-store
swap expensive again. The same grep for `ClickHouseAnalyticsReader` must answer identically.

### `packages/auth`

```
packages/auth/src/
├── index.ts                                 ← ServerOnly.assert()
├── import.ts                                ← every external symbol
├── auth.config.ts                           → AuthConfig
├── auth.factory.ts                          → AuthFactory.create(...)
├── session/
│   ├── index.ts
│   ├── better-auth.session-resolver.ts      → BetterAuthSessionResolver
│   └── membership.reader.ts                 → MembershipReader
├── principal/
│   ├── index.ts
│   ├── principal.builder.ts                 → PrincipalBuilder
│   └── capability.cache.ts                  → CapabilityCache
├── apikey/
│   ├── index.ts
│   ├── api-key.hasher.ts                    → ApiKeyHasher
│   └── api-key.resolver.ts                  → ApiKeyResolver
└── tables/
    └── index.ts                             ← schema inspection, never built

packages/auth/tests/
└── principal/
    └── capability.cache.spec.ts
```

### `packages/composition`

```
packages/composition/src/
├── index.ts                         ← ServerOnly.assert()
├── import.ts                        ← every external symbol, both sides of every seam
├── container/
│   ├── index.ts
│   ├── container.config.ts          → ContainerConfig
│   ├── container.ts                 → Container
│   └── test-container.ts            → TestContainer, TestPorts   (off the barrel)
└── fake/
    ├── index.ts
    └── …                            one fake per port in `application/src/port/`
```

**Every wiring decision is here and nowhere else**, which is why `import.ts` is the longest in the repository — naming a port and the class behind it exactly once is the whole deliverable.

**`test-container.ts` and `fake/` live in `src/`, not `tests/`, deliberately.** `TestPorts` has one entry per abstract class in `application/src/port/`, so adding a port there stops this file compiling until it has a double — a `tsc` check rather than a spec's. `tsup` builds from `index.ts`, which names neither, so nothing reaches `dist/`.

---

## Phase D — the client side

### `packages/api-client`

```
packages/api-client/src/
├── index.ts
├── import.ts                        ← every external symbol. Note what is absent
├── client/
│   ├── index.ts
│   └── api-client.ts                → ApiClient  (private ctor; overHttp / inProcess)
└── auth/
    ├── index.ts
    ├── auth.client.ts               → AuthClient  (better-auth vanilla, never /react)
    ├── auth.strategy.ts             → AuthStrategy  (abstract), RequestCredentials
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

Three entrypoints in `exports`: `.`, `./font.css`, `./sprite.svg`. Two `tsup` requirements come with
them — a `loader` map for the binary imports, and `"asset.d.ts"` in the tsconfig `include`, since a
`.d.ts` above `src/` is otherwise outside the program ([19](19-asset-package.md)).

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
├── media/                           ── shape 2: media references
│   ├── index.ts
│   ├── media-ref.ts                 → MediaResolver, ResolvedMedia
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
├── document/                        ── shape 4: long-form editorial
│   ├── index.ts
│   ├── document.schema.ts           → DocumentContract
│   └── document.entity.ts           → DocumentEntity, DocumentRecord
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
├── index.tsx                      ← "use client" on line 1
├── import.ts                      ← every external symbol
├── key/
│   ├── index.ts
│   └── query-key.ts               → QueryKeys       (mirrors procedure paths)
├── runtime/
│   ├── index.ts
│   ├── query-client.ts            → createQueryClient()
│   ├── api-client.context.tsx     → ApiClientProvider, useApiClient
│   └── use-app-mutation.ts        → useAppMutation   (declarative `invalidates`)
├── session/
│   ├── index.ts
│   ├── session.queries.ts         → SessionQueries
│   └── session.mutations.ts       → SessionMutations
└── <slice>/
    ├── index.ts
    ├── <slice>.queries.ts         → <Slice>Queries   (queryOptions factories)
    └── <slice>.mutations.ts       → <Slice>Mutations
```

**The only package that may import `@tanstack/*`** — and still not the router package from the same vendor. Two role folders (`key/`, `runtime/`) plus one subject folder per slice, the same split `contracts` has.

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
    │                                      ★ server-only by marker import — see below
    ├── endpoint.ts                      → Endpoint  ← the client-safe half of env.ts
    ├── router.tsx
    ├── route-tree.gen.ts               ← generated by the vite plugin; gitignored
    ├── server/                         ← THE ENTIRE TRANSPORT LAYER
    │   ├── container.ts                ← module-scope Container, one per process
    │   ├── cors.ts                     → Cors  (the desktop client is cross-origin)
    │   ├── rpc-client.ts               → createServerRpcClient(request)
    │   └── orpc/
    │       ├── base.ts                 → base, correlation/error/principal middleware
    │       ├── error.interceptor.ts    → AppError.code → ORPCError
    │       ├── handler.ts              → handleRpc(request)
    │       ├── app.router.ts           → appRouter  (mirrors `contract` exactly)
    │       └── <subject>.router.ts     → <Subject>Router  (three lines per procedure)
    └── route/                          ← pages, plus 2 files that MOUNT the handlers
        ├── __root.tsx                  ← token.css, theme.css, all four providers
        ├── -context.ts                 → RouterContext
        ├── -guard.ts                   → RouteGuard   (hyphen = not a route)
        ├── -messages.ts                ← StaticDataRouteOption augmentation
        ├── index.tsx
        ├── sign-in.tsx
        ├── forbidden.tsx
        ├── api/                        ← Start server routes. 3 lines each
        │   ├── rpc/$.ts                ← → handleRpc(request)
        │   └── auth/$.ts               ← → container.auth.handler(request)
        └── <slice>/
            └── index.tsx
```

**The API endpoints are Start server routes in `src/route/api/`, and `src/server/` is still the
entire transport layer.** Those two files are three lines each and do nothing but hand a `Request`
to `src/server/` — the seam, not the layer. An earlier revision mounted them through Nitro's own
`serverDir` scanning instead; that worked, but only on the Nitro deployment target, and swapping in
the Cloudflare or Netlify plugin would have dropped `/api/*` with no build error
([24](24-web-app.md)).

**`env.ts` and `endpoint.ts` are a deliberate pair, not duplication.** `env.ts` carries the marker
import that makes Start's import-protection plugin fail the build if it is ever reachable from the
client graph; `endpoint.ts` is what isomorphic code — `router.tsx`, a route component — is allowed to
import instead. Before the split, one accessor on `Env` put the whole server schema in the browser
bundle and the app could not hydrate ([24](24-web-app.md) Step 24.2).

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

**Then open one.** Every barrel names each symbol it publishes — `export { Clock, FixedClock, SystemClock } from "./clock.js"`, never `export *`, enforced by Biome's `noReExportAll` ([05](05-lint-and-format.md), [Opinions · Imports](../opinions/imports.md)). The `→ Name` annotations in the trees above are what a file *contains*; the barrel is what a package *publishes*, and those are deliberately allowed to differ. `packages/infrastructure/src/pg/schema/index.ts` is the single exemption, because drizzle-kit consumes it and nothing else does.

**Notice what `apps/` does not contain.** No business logic, no schema, no permission decision, no domain error. Across three shells: two `env.ts` files, one `endpoint.ts`, one `config.ts`, one transport directory, one bootstrap, and route files that compose. If any app directory grows past a few hundred lines of non-route code, something drifted downward that belongs in `packages/`.

**Three shells, still two `process.env` readers.** `web` and `worker` read the environment; `desktop` cannot, because a webview has no Node runtime. So the assertion in [26](26-hygiene-and-ci.md) holds at two without an exemption, and it holds for a reason rather than by convention.

**Notice the `<slice>` folders repeating.** `permissions/catalog/`, `contracts/<subject>/`, `application/<slice>/`, `db/<slice>/`, `query/<slice>/`, `feature/<slice>/`, `web/route/<slice>/`. Seven places, one glob per team: `packages/*/src/<slice>/**`. The twelve-step checklist in [27](27-verification-and-first-feature.md) is just this list, walked in dependency order.

**Notice the four `ServerOnly.assert()` markers** — `db`, `infrastructure`, `auth`, and `composition`. Those four packages must never reach a browser bundle, and there are three independent defences saying so: the Biome import boundary, that runtime assertion, and the CI bundle grep.

---

## ✅ Gate

Your tree matches this one, allowing for slices you have and slices you don't.

---

[← Verification & First Feature](27-verification-and-first-feature.md) · [Naming & Boundaries →](29-naming-and-boundaries.md)

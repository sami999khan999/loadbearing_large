# 29 · Naming and boundaries

> The reference you will consult most often. Every rule for naming a thing, a folder-by-folder account of what each directory is for, and one small feature traced through all of it.

**Delivers:** Nothing new. This is a reference — but it is the one to read before writing your first feature.

Part 1 is naming: what to call a thing. Part 2 walks every folder in the repository and says what belongs in it, what does not, and the sign that something landed in the wrong place. Part 3 traces one small feature through all of it.

**Prerequisite:** [28 · Folder structure](28-folder-structure.md)

---

## The test every rule serves

**Given a feature name and a layer, you should be able to write the file path and the class name without looking anything up.**

That is the only justification any convention below needs. When a rule stops producing that property, the rule has a gap worth fixing rather than working around.

---

# Part 1 — Naming

## 1.1 Files

**Everything is kebab-case, including React component files.** Case-sensitive CI plus case-insensitive macOS produces Git renames that appear to change nothing. Kebab-case sidesteps the entire class of problem, and `forceConsistentCasingInFileNames` ([04](04-typescript-configs.md)) catches what slips through.

Files carrying a recognised architectural role take a **dot-suffix**: `<subject>.<role>.ts`

| Role suffix | Example file | Exports |
|---|---|---|
| `.contract.ts` | `task.contract.ts` | `TaskContract` |
| `.entity.ts` | `task.entity.ts` | `TaskEntity` |
| `.procedures.ts` | `task.procedures.ts` | `TaskProcedures` |
| `.use-case.ts` | `reactivate-task.use-case.ts` | `ReactivateTaskUseCase` |
| `.repository.ts` | `capability.repository.ts` | `CapabilityRepository` |
| `.gateway.ts` | `s3-storage.gateway.ts` | `S3StorageGateway` |
| `.store.ts` | `pg-vector.store.ts` | `PgVectorStore` |
| `.policy.ts` | `overdue-lock.policy.ts` | `OverdueLockPolicy` |
| `.strategy.ts` | `bearer-auth.strategy.ts` | `BearerAuthStrategy` |
| `.router.ts` | `task.router.ts` | `TaskRouter` |
| `.middleware.ts` | `principal.middleware.ts` | `principalMiddleware` |
| `.consumer.ts` | `embedding.consumer.ts` | `EmbeddingConsumer` |
| `.schedule.ts` | `overdue-sweep.schedule.ts` | `OverdueSweepSchedule` |
| `.error.ts` | `forbidden.error.ts` | `ForbiddenError` |
| `.schema.ts` | `rbac.schema.ts` | Drizzle tables |
| `.permissions.ts` | `task.permissions.ts` | a catalog fragment |
| `.spec.ts` | `reactivate-task.use-case.spec.ts` | tests, in the package's `tests/` |

**Files with no layer role stay plain kebab-case**: `permission-registry.ts`, `capability-set.ts`, `clock.ts`, `container.ts`. This is why `core` and `permissions` read differently from `application` — those classes are not *in* a layer, they are the vocabulary the layers use.

**One class per file, and the filename derives from the class.** Mechanically: strip the role suffix from the class name, kebab-case the remainder, append `.<role>.ts`. `ReactivateTaskUseCase` → `reactivate-task.use-case.ts`.

## 1.2 Folders

**A subject folder is singular, and every file inside is prefixed with the folder's name.** The folder is the subject; the suffix is the role. A path tells you both without opening anything.

```
packages/contracts/src/task/
├── index.ts
├── task.contract.ts
├── task.entity.ts
└── task.procedures.ts
```

**Non-subject folders are the layer noun, also singular**: `port/`, `primitive/`, `vector/`, `seed/`, `consumer/`, `schedule/`. No plurals anywhere — `tasks/` and `task/` coexisting in different packages is exactly the ambiguity this removes.

### The two exemptions

**1. Use-case files lead with the verb.** `reactivate-task.use-case.ts`, not `task-reactivate.use-case.ts`. The class is `ReactivateTaskUseCase`, and mirroring the class outranks folder-prefix symmetry.

**2. Implementation files lead with the technology.** `pg-vector.store.ts`, `redis.cache-store.ts`, `s3-storage.gateway.ts`, `bearer-auth.strategy.ts`. You should be able to see what you would delete when a vendor changes.

### Framework-dictated files win

`$goalId.tsx`, `-guard.ts`, `rpc.$.ts`, `vite.config.ts`, `drizzle.config.ts`, `tsup.config.ts`. Inside `apps/web/src/route/` especially, TanStack's routing conventions are load-bearing — a `-` prefix is what marks a file as *not* a route. Don't fight them.

## 1.3 Barrels and imports

**Every package has exactly one public entrypoint: `src/index.ts`.** It re-exports and contains no logic. The `exports` map points at it and nothing else — no deep subpaths, so no consumer can reach into a package's internals and break when you move a file.

The only permitted extra exports are non-JS side-effect files that physically cannot live in a barrel: `@loadbearing/asset` ships `./font.css` and `./sprite.svg`; `@loadbearing/ui` ships `./token.css` and `./theme.css`. **A package wanting extra JavaScript subpaths is a signal it should be two packages.**

### Barrels name every export. `export *` is banned.

```ts
// packages/core/src/index.ts
export { Clock, FixedClock, SystemClock } from "./clock.js";
export { Err, Ok, type Result, Results } from "./result.js";
export { ServerOnly } from "./server-only.js";
export { Uuid } from "./uuid.js";
```

Not `export * from "./clock.js"`. Enforced by Biome's `performance/noReExportAll`, set to `error` ([05](05-lint-and-format.md)).

Four reasons, in the order they will bite you:

**1. `export *` makes the public API an accident.** With a star, adding `export` to any symbol in any file silently publishes it to every consumer in the repository. The reviewer looking at the diff on `clock.ts` sees a new class; they do not see that the package's public surface just grew. With a named list, widening the API is a second, deliberate edit to `index.ts` — visible in the diff, reviewable on its own terms, and attributable. This is the same reason the `exports` map has no deep subpaths: **the surface is a decision, not a side effect.**

**2. It gives you a private layer.** Rule 3 below has siblings importing each other by direct file path. Under `export *`, every symbol a sibling needs is automatically public. Under a named list, `capability-set.ts` can export a helper that `permission-registry.ts` imports directly while the barrel never mentions it — internal by default, public by choice.

**3. Collisions fail silently.** Two starred files exporting the same name do not error. ESM resolves the ambiguity by excluding the name from the namespace entirely, so the export simply vanishes and the failure surfaces downstream as an import that resolves to `undefined`. A named list produces a duplicate-identifier error at the barrel, on the line that caused it.

**4. `verbatimModuleSyntax` needs the distinction.** Named re-exports carry the inline `type` modifier — `export { Err, Ok, type Result, Results }` — so type-only symbols stay erased at compile time. A star export cannot say which of its names are types.

**Ordering is not yours to choose.** `biome check --write` sorts the statements by module specifier and the specifiers inside each brace alphabetically, ignoring the `type` keyword. Write them in any order and let the formatter settle it.

**One exemption: `packages/db/src/schema.ts`.** It exists so `drizzle-kit` and `drizzle(pool, { schema })` receive every table, relation, and enum in the package; hand-enumerating them would add no API-surface safety, because the file is not an entrypoint — `index.ts` republishes it as a single namespace. The Biome rule is switched off for that one path and nowhere else. The namespace re-export itself is written as two statements, because `export * as schema from` is a star export too:

```ts
// packages/db/src/index.ts
import * as schema from "./schema.js";

export { schema };
```

**Import rules, in priority order:**

1. **Across packages** — always the package name: `import { TaskEntity } from "@loadbearing/contracts"`.
2. **Across folders inside a package** — the folder barrel: `import { Identifiers } from "../primitive/index.js"`.
3. **Within one folder** — the direct file: `import { TaskContract } from "./task.contract.js"`.

**Rule 3 is not stylistic.** Importing a sibling *through* your own folder barrel is the standard way to create a circular import, and the failure mode is a runtime `undefined` at module-init time that looks nothing like an import problem.

> **Don't build a shared `import.ts` hub.** A file re-exporting everything a package imports forces every module to depend on the package's entire external surface: slower HMR, defeated tree-shaking, and cycles that are trivial to create and miserable to trace. If you want the single-surface property, take the type-only version — a `type.ts` re-exporting only `import type` symbols, which is erased at compile time and cannot produce a cycle.

## 1.4 Classes

| Kind | Convention | Example |
|---|---|---|
| Abstract seam | Plain role noun — **no `I`, no `Abstract`** | `VectorStore`, `AuthStrategy`, `Clock` |
| Concrete implementation | **Technology prefix** + the seam name | `PgVectorStore`, `S3StorageGateway`, `SystemClock` |
| Test double | `Fake` or `Fixed` prefix | `FakeTaskRepository`, `FixedClock` |
| Use-case | `<Verb><Noun>UseCase` | `ReactivateTaskUseCase` |
| Repository | `<Aggregate>Repository` | `TaskRepository` |
| Entity | `<Noun>Entity` | `TaskEntity` |
| Contract | `<Noun>Contract` | `TaskContract` |
| Error | `<Reason>Error` | `ForbiddenError` |

The technology-prefix rule is what makes a seam visible at a glance. Seeing `PgVectorStore` in the `Container` and `VectorStore` everywhere else tells you exactly where the Qdrant swap happens ([14](14-vector-store.md)).

**Banned suffixes:** `Manager`, `Helper`, `Util`, `Handler`, and bare `Service`. They describe nothing. If a class fits none of `UseCase`, `Repository`, `Gateway`, `Store`, `Policy`, `Strategy`, `Entity`, `Registry`, it probably wants splitting. `Policy` is the escape valve for a domain rule too broad for one entity.

**Banned filenames:** `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`. A barrel may re-export; it may never contain logic.

## 1.5 Methods

| Pattern | Rule | Example |
|---|---|---|
| Use-case entry | Always `execute` | `execute(principal, input)` |
| Repository read, nullable | `findBy<X>` | `findById` |
| Repository read, throwing | `findBy<X>OrFail` | `findByIdOrFail` |
| Repository write | `save`, `delete` — never `update`/`insert` | `save(entity)` |
| Existence | `exists<X>` | `existsByEmail` |
| Mapping | `toDto` / `fromDto` / `toEntity` | `TaskEntity.fromDto(dto)` |
| Factory | `static from<X>` or `static create` | `CapabilitySet.from(dto)` |
| Boolean | `is` / `has` / `can` / `should` prefix | `isLockedFromAssignee()` |
| Assertion (throws) | `assert<X>` | `authorizer.assert(...)` |
| Predicate (returns) | `can<X>` | `capabilities.can(...)` |

**The `assert` vs `can` split is worth internalising.** `can()` answers a question; `assert()` enforces an outcome. Mixing them produces the exact bug this architecture exists to prevent — a UI check silently becoming the only check.

## 1.6 Permissions, procedures, events, queues

Four vocabularies that look alike and mean different things.

| Kind | Grammar | Example |
|---|---|---|
| **Permission key** | `<module>.<subject>.<action>[.<qualifier>]`, action **imperative** | `task.reactivate`, `task.update.self` |
| **Procedure path** | `<subject>.<action>`, mirrors the permission it requires | `task.reactivate` |
| **Activity / event name** | `<subject>.<action>`, action **past tense** | `task.reactivated` |
| **Queue name** | `<domain>.<work>`, noun-ish | `embedding.generate` |
| **Repeatable job key** | `schedule.<name>` | `schedule.overdue-sweep` |

**Permission actions are imperative because they name a capability you hold; activity names are past tense because they record something that happened.** `task.reactivate` is a right. `task.reactivated` is a fact. Keeping them distinct is what makes an audit log readable.

**The qualifier vocabulary is closed**: `.self`, `.goal`, `.global`, `.org`. Don't invent `.own` or `.mine` alongside `.self`.

**Procedure paths mirror their permission where the mapping is 1:1**, and the `ProcedurePermissions` map stays explicit regardless. An identity-looking map is still the thing that fails closed when someone adds a procedure and forgets the entry ([10](10-contracts-package.md), [24](24-web-app.md)).

**REST paths** on `.route({ path })` are kebab-case, plural resources, braced params matching the contract field name: `/tasks/{taskId}/reactivate`.

## 1.7 Contract members

Every `*Contract` class uses the same static member names, so reading one is reading all of them.

| Member | Holds |
|---|---|
| `entity` | the full resource shape |
| `create` | creation input |
| `update` | patch input |
| `listQuery` | filter / pagination input |
| `<verb>` | any domain action's input — `reactivate`, `approve` |

Derived types follow the schema name: `TaskDto` from `entity`, `CreateTaskInput` from `create`. **`Dto` for wire shapes, `Input` for procedure inputs**, never both on one type.

## 1.8 Database

| Object | Convention | Example |
|---|---|---|
| Table | `snake_case`, **plural** | `goal_members` |
| Column | `snake_case`, singular | `assignee_id` |
| Foreign key | `<referenced_singular>_id` | `goal_id` |
| Boolean column | `is_` / `has_` prefix | `is_system` |
| Timestamp column | `<verb>ed_at` | `reactivated_at` |
| Unique index | `<table>_<cols>_uq` | `goal_member_uq` |
| Regular index | `<table>_<cols>_idx` | `goal_member_user_idx` |
| Enum values | `snake_case` | `in_progress` |
| Drizzle export | `camelCase` plural, matching the table | `goalMembers` |

**Zod enums mirror the DB enum values exactly** — `in_progress`, never `IN_PROGRESS` or `InProgress`. One string travels from Postgres to a React `<select>` with no mapping layer to drift.

## 1.9 Packages, env, React

- **Packages:** `@loadbearing/<single-lowercase-word>`. Scope by layer, never by feature — no `@loadbearing/task-contracts`.
- **Env vars:** `SCREAMING_SNAKE_CASE`, prefixed by subsystem: `DATABASE_URL`, `S3_BUCKET`. Client-exposed vars carry the framework's public prefix and nothing else does.
- **React components:** `PascalCase` export in a kebab-case file — `task-card.tsx` exports `TaskCard`.
- **Hooks:** `use<Noun>` — `useCapabilities`.
- **Props type:** `<Component>Props`, same file.
- **Handler props:** `on<Event>`; the implementations filling them: `handle<Event>`.
- **Query factories:** `<Subject>Queries` / `<Subject>Mutations` in `@loadbearing/query`, never in `api-client`.
- **Query keys** mirror the procedure path, params last: `["task", "list", { goalId }]`. Never hand-written at a call site.

---

# Part 2 — What every folder is for

Walked top to bottom, in the order the tree in [28](28-folder-structure.md) lists them. For each folder: what belongs in it, what does not, and the sign that something landed in the wrong place.

---

## 2.1 The four root directories

### `apps/`

- **Holds** the three deployable shells — `web`, `worker`, and `desktop`. Each one reads configuration, mounts a transport, and composes components that live elsewhere.
- **Is the only place `process.env` is read.** Exactly two files repo-wide — `web` and `worker` — and CI asserts it. `desktop` is not a third: a webview has no Node runtime, so it reads `import.meta.env` and could not reach a server secret if it tried ([30](30-desktop-app.md)).
- **Is the only place `@tanstack/react-router` appears.** Routing is app-shaped, not product-shaped.
- **Never holds** business logic, database schema, permission decisions, or domain errors.
- **Should be deletable.** The test: if you threw away `apps/` entirely, could you rebuild it in a week against the same `packages/`? If not, something drifted upward that belongs below.
- **Smell:** any app directory growing past a few hundred lines of non-route code.

### `packages/`

- **Holds everything that matters** — primitives, permissions, contracts, use-cases, adapters, components. Fifteen packages, each with one job.
- **Knows nothing about which web framework you use.** No package imports `@tanstack/react-start`, and only one imports `@tanstack/*` at all.
- **Never reads its own configuration.** Every package receives what it needs through a constructor. That is what makes the same `Container` work in a web server and a worker.
- **Smell:** a package reaching for `process.env` because "it just needs one value."

### `tooling/`

- **Holds three workspace packages** that configure the build: `tsconfig`, `biome-config`, and `eslint-config`. Plus `scripts/`, which holds the architecture assertions.
- **`biome-config` is the odd one out**: it is a workspace member for organisation only. The root `biome.json` reaches it by *relative path*, because Biome's `extends` cannot resolve a package specifier — so unlike the other two, the root does not declare it as a dependency.
- **Is consumed by every other package** but imported at runtime by none. These are `devDependencies` and config `extends` targets only.
- **Is platform-owned.** Changes here affect all fifteen packages, so they go through whoever owns the repo rather than whoever is shipping a feature.
- **Never holds** runtime code, shared utilities, or "helpers that everything needs." Those want a real package.
- **Smell:** anything under `tooling/` appearing in a `dependencies` block.

### `infra/`

- **Holds descriptions of running services**: `docker-compose.yml` and the Postgres init SQL that creates extensions.
- **Is development-shaped.** It is not your production deployment; it is the local approximation of it. The mapping table in [11](11-local-infrastructure.md) says which managed service replaces each container.
- **Never holds** application code of any kind.
- **Smell:** a `.ts` file.

---

## 2.2 Root files

- **`pnpm-workspace.yaml`** — three jobs in one file: workspace membership, the dependency version catalog, and every pnpm setting. Under pnpm 11 this is the *only* place settings can go.
- **`package.json`** — scripts, `devEngines.packageManager`, and devDependencies. It declares the two `tooling/*` configs it imports and no `packages/*` member, ever. A root declaration hoists a package into the root `node_modules` where everything can reach it, which quietly disables the boundary the whole architecture rests on.
- **`.nvmrc`** — the Node major. CI reads this same file, so the two cannot drift.
- **`.env.example`** — the complete variable list. It is documentation as much as a template: the two `env.ts` schemas are the enforcement, this is the discoverable copy.
- **`.gitattributes`** — line-ending normalisation. One of three defences, alongside `.editorconfig` and Prettier's `endOfLine`.
- **`commitlint.config.js`** — the closed scope list. Adding a package means adding a scope; a rejected commit is the reminder.
- **`biome.json`** — two lines, extending `tooling/biome-config/src/base.json`, which holds formatting, import organisation, the fast lint rules, the server-only import boundary, and the `env.ts` exemption.
- **`eslint.config.js`** — a one-line re-export of `@loadbearing/eslint-config`, which holds the six rules Biome cannot express.
- **`.husky/`** — three hooks. `pre-commit` runs Biome on staged files only; `pre-push` runs the slow ESLint pass; `commit-msg` runs commitlint. Nothing whole-project goes in `pre-commit` — a hook that takes ten seconds gets disabled.
- **`.github/workflows/`** — the `verify` job. Services, install, build, typecheck, lint, test, architecture greps.

---

## 2.3 The shape every package has

- **`package.json`** — name, `exports` map, scripts. The `exports` map points at `src/index.ts` and nothing else, which is what stops consumers reaching into internals. It carries the `development` condition so Vite can resolve to source in dev.
- **`tsconfig.json`** — four lines, extending one of the `tooling/tsconfig` bases.
- **`tsup.config.ts`** — entry, `dts: true`, ESM only, `target: es2024`.
- **No lint config.** Both linters run once from the root, keyed on globs. A package's specific bans — `feature` blocking `api-client`, the OOP rules applying only to non-React packages — are `overrides` blocks in `biome.json` and `files` blocks in `eslint.config.js`. Keeping them central means a package cannot opt itself out of a rule that exists to constrain it.
- **`src/index.ts`** — the public surface. Re-exports only, never logic. Server-only packages call `ServerOnly.assert()` on line two.
- **`docs/`** — reference documentation for the package. Exactly two files at its root: `meta.json` (sidebar title, description, page order) and `index.md` (the overview). **Every other page lives in `docs/reference/`**, which carries its own `meta.json` for the group label and ordering. Plain Markdown with YAML frontmatter, **never MDX**, so it renders on GitHub and can be picked up by a documentation site later without rewriting content. Callouts use GitHub alert syntax. Not in `files`, so it never ships.

**Every subfolder inside `src/` also has an `index.ts`.** That is what lets you move a file within a folder without touching a single import elsewhere.

**`docs/` is reference, `docs/setup/` at the root is build order.** Different audiences and different shapes: the root sequence is walked once, a package's docs are consulted continually. Keep them apart.

---

## 2.4 Inside `packages/core`

- **`src/`** is flat — no subfolders. Four primitives and their specs. If `core` ever needs a subfolder, it has grown past its job.
- **Holds** things with no dependencies at all, not even on other `@loadbearing/*` packages: `Clock`, `Result`, `Uuid`, `ServerOnly`.
- **Never holds** a domain noun. `TaskId` is a `contracts` concern, not a primitive.
- **Smell:** an import statement in any file here.

---

## 2.5 Inside `packages/permissions`

- **`src/` root files** — the three classes that define the model. `permission-registry.ts` is the vocabulary, `module-registry.ts` is the nav gate, `capability-set.ts` is the resolution algorithm.
- **`catalog/`** — one file per feature slice, each declaring that slice's permission keys, plus a platform-owned `index.ts` that merges them. **This folder is the team-ownership seam**: one team, one file, no merge conflicts in a shared list.
- **`gate/`** — the same fragment pattern for module gates, which is what nav items are allowed to reference.
- **The whole package is synchronous and pure.** No I/O, no database, no `async`. That is not a stylistic choice — it is what lets the identical class run in the oRPC handler, the React component, the worker, and the desktop app and give the same answer.
- **Smell:** an `async` method, or an import of anything outside `core`.

---

## 2.6 Inside `packages/contracts`

- **`primitive/`** — the shared vocabulary every subject uses: branded identifiers, `Envelope`, `Pagination`. Non-subject folder, so it takes the layer noun.
- **`<subject>/`** — one folder per domain subject (`task/`, `goal/`, `lead/`). Four files each: the Zod shapes, the entity with behaviour, the oRPC procedures, and the entity's spec.
- **`permission/`** — one fragment per subject, mapping procedure path → permission key. Separate from the subject folders because it is a *cross-check*, not part of the subject's definition, and because the coverage test walks this folder specifically.
- **`contract-router.ts` / `procedure-permissions.ts`** — the two merge points. Adding a subject means editing exactly these two files.
- **The whole package is isomorphic.** It is imported freely by both server and browser, which is why nothing in it may perform I/O.
- **Smell:** an entity method that fetches something. Entities carry behaviour (`isLockedFromAssignee()`), never data access.

---

## 2.7 Inside `packages/application`

- **`error/`** — the domain error hierarchy. Each carries a `code` string, which is the *only* thing the transport layer maps. No HTTP status codes anywhere in this folder.
- **`port/`** — abstract classes for cross-cutting infrastructure: cache, storage, queue, vector store, embeddings, sessions, activity, unit of work, event bus. One file per capability, all abstract, zero implementations.
- **`<slice>/`** — one folder per feature slice, holding that slice's use-cases, its policies, **and its repository port**.
- **Repository ports live in the slice, not in `port/`.** `port/` is for capabilities the whole system shares; `TaskRepository` is meaningful only next to the use-cases that need it. Putting it in `port/` would make that folder grow by one file per feature forever.
- **Every use-case has one public method, `execute(principal, input)`**, following load → authorize → work → persist.
- **This package imports no framework at all.** `check-architecture.mjs` greps for `@orpc`, `@tanstack`, `drizzle-orm`, `ioredis`, `bullmq`, `@aws-sdk`, `better-auth` and fails the build on any hit.
- **Smell:** `import { sql }`, or a use-case that skips step two.

---

## 2.8 Inside `packages/db`

- **`drizzle.config.ts` and `migrations/`** sit **above** `src/` because they are build-time artefacts, not shipped code. Migrations are generated and committed; `db:push` is never used.
- **`src/` root files** — `database.ts` (the pool), `schema.ts` (a barrel re-exporting every `*.schema.ts`, which is what Drizzle Kit reads), `base.repository.ts`, `unit-of-work.ts`.
- **`rbac/`** — the permission tables, the Better Auth CLI output, the API-key tables, and `PgCapabilityRepository`. Subject folder for the auth domain.
- **`activity/`** — the audit table and `PgActivityLogger`.
- **`vector/`** — the embeddings table and `PgVectorStore`. **This is infrastructure, not a feature slice**, which is why it sits alongside `rbac/` rather than inside one.
- **`seed/`** — idempotent seeds, run after migration. The owner role's grants come from `PermissionRegistry.all()` so they cannot fall behind the catalog.
- **`<slice>/`** — one folder per feature, holding that slice's schema and its `Pg<Slice>Repository`.
- **The layout is by subject, not by layer.** No `schema/` folder holding twenty schemas and a `repository/` folder holding twenty repositories — a feature's schema and repository sit together, so a team owns one directory.
- **Repositories fetch and persist. They never decide.** A `capabilities.can()` call in this package means an authorization decision escaped the use-case.
- **Smell:** a permission check, or a folder for a non-Postgres concern.

---

## 2.9 Inside `packages/infrastructure`

- **`redis/`** — the connection itself, shared by the cache and the queue but configured differently for each (`maxRetriesPerRequest: null` for BullMQ, a key prefix only for the cache).
- **`cache/`** — `RedisCacheStore`, implementing the `CacheStore` port.
- **`storage/`** — `S3StorageGateway` and `StorageKey`. The gateway never takes a bucket in a method signature; the bucket is configuration.
- **`queue/`** — `QueueName` (a closed union) and `BullMqQueuePublisher`.
- **`embedding/`** — `OpenAiEmbeddingProvider`.
- **One folder per external system, named after the capability, with files named after the technology.** That pairing is what makes a vendor swap visibly local: you delete `s3-storage.gateway.ts` and write `azure-storage.gateway.ts`, and `storage/index.ts` is the only other file that changes.
- **Contains no business logic.** These are adapters: translate a port call into a vendor call, translate the response back.
- **Smell:** a domain noun in a method name, or an import of `db`.

---

## 2.10 Inside `packages/auth`

- **`src/` root files** — `AuthConfig` and `AuthFactory`. The factory is the only place Better Auth is constructed.
- **`session/`** — `BetterAuthSessionResolver`, implementing the `SessionResolver` port. This is the wall: Better Auth types stop here.
- **`principal/`** — `PrincipalBuilder` (any credential → a `Principal`) and `CapabilityCache` (Redis, short TTL, invalidated explicitly on every grant change — the TTL is a backstop, not the mechanism).
- **`apikey/`** — hashing and resolution. The resolver re-intersects a key's grants with the *issuer's current* capabilities on every request, so revoking a person's access revokes their keys' access at the same instant.
- **The rest of the system never sees Better Auth.** Transport calls `PrincipalBuilder`; use-cases receive a `Principal`. Swapping the auth library rewrites this package and nothing else.
- **Smell:** `better-auth` imported from any other package.

---

## 2.11 Inside `packages/composition`

- **Three files, no subfolders.** `ContainerConfig` (the shape), `Container` (the wiring), `TestContainer` (the same wiring with fakes).
- **Constructs every concrete class exactly once.** This is the only file in the repository that knows `PgVectorStore` and `VectorStore` are related.
- **Exposes ports as abstract types**, so a consumer holding `container.vectorStore` cannot accidentally depend on the concrete class.
- **Contains no logic.** An `if` that is not about configuration means something crept in.
- **Disposes in reverse construction order**, so the pool closes after the things using it.
- **Smell:** the word "if" anywhere except reading a config flag; lazy instantiation, which hides a construction failure until the first request.

---

## 2.12 Inside `packages/api-client`

- **`src/` root** — `ApiClient`, with a private constructor and two factories: `overHttp` (browser and desktop) and `inProcess` (SSR, no network hop).
- **`auth/`** — `AuthStrategy` (abstract) and its two implementations, plus `TokenProvider` (abstract) and `AuthClient`. This folder is the entire difference between a web client and a desktop client.
- **Never imports `react` or `@tanstack/*`.** It must load in plain Node scripts, integration tests, and any future non-React host.
- **Caches nothing.** Caching is `query`'s job, and the split exists because the two change for different reasons — this package when the backend changes, `query` when product behaviour does.
- **Smell:** a hook, or a `queryKey`.

---

## 2.13 Inside `packages/asset`

- **`image/`** — a closed `ImageKey` union plus the files themselves under `file/`. A content record naming a missing image is a compile error.
- **`icon/`** — source SVGs under `svg/`, plus the generated `sprite.svg` and `IconRegistry`. The sprite is gitignored; `build-sprite.mjs` regenerates it and fails the build on any hardcoded `fill` or `stroke`, because a hardcoded colour is an icon that breaks in dark mode.
- **`font/`** — self-hosted variable fonts and the `@font-face` CSS. Self-hosted so there is no third-party request on first paint.
- **`build-sprite.mjs`** sits above `src/` — build tooling, not shipped code.
- **Holds only assets you ship.** User uploads are S3's problem and never appear here.
- **Smell:** a file that differs per environment.

---

## 2.14 Inside `packages/content`

- **`message/`** — short keyed strings, one file per namespace, `en/` complete and every other locale `Partial<>` with fallback. `MessageKey` is a closed union, so a typo in a component is a compile error.
- **`document/`** — long-form editorial content with a schema and an entity.
- **`collection/`** — repeating records, including `nav/`. Nav items carry a **module**, never a permission — a `files`-scoped block in the root ESLint config bans importing `PermissionKey` here, because content authors should not be making authorization decisions.
- **`media/`** — `MediaRef` and the resolver that turns one into a URL.
- **`content-source.ts`** — abstract, with **every method async even though the static implementation is synchronous**. That is deliberate: it means moving to a CMS later changes no call site.
- **Smell:** a permission key, or a synchronous read method.

---

## 2.15 Inside `packages/query`

- **`src/` root** — `QueryKeys` (mirroring procedure paths, params last), `createQueryClient()`, the `ApiClientProvider` context, and `useAppMutation`.
- **`session/`** — session queries and mutations, the one slice that ships with the kit.
- **`<slice>/`** — per-feature `queryOptions` factories and mutations.
- **The single TanStack owner.** Exactly one package imports `@tanstack/*`, and this is it.
- **Still may not import `@tanstack/react-router`.** Routing stays in the app, which is what lets a desktop shell reuse everything above this layer.
- **`createQueryClient()` is a factory, not a singleton**, because a module-scope client on the server is shared across concurrent requests — a cross-tenant leak, not a caching bug.
- **Smell:** a hand-written query key at a call site.

---

## 2.16 Inside `packages/ui`

- **`token/`** — spacing, radii, type scale, motion durations. **Deliberately no colours.**
- **`theme/`** — colours, as `[data-theme="…"]` custom properties, plus the registry. Splitting these two is what makes a second theme a file instead of a refactor.
- **`icon/`, `can/`, `data-table/`, `dialog/`, `empty-state/`, `status-badge/`** — one folder per component, each with its `index.ts` and optionally a `.stories.tsx`.
- **No domain nouns.** `DataTable`, never `TaskTable`. The test is mechanical and has no judgement call in it: if the name contains a domain word, the component belongs in `feature`.
- **No router import.** Navigation arrives as an `onNavigate` prop or an `href` string.
- **`<Can>` lives here but is convenience, never the gate.** The gate is `Authorizer.assert()` in the use-case.
- **Smell:** a domain noun in an export, or a `useNavigate`.

---

## 2.17 Inside `packages/feature`

- **`i18n/`** — the message provider and hook. Lives here rather than in `content` because it is React.
- **`auth/`** — sign-in, two-factor, the session guard, and the session context. `SessionProvider` takes a `CapabilitySetDto` and reconstructs the class, so the browser runs the identical resolution the server ran.
- **`rbac/`** — the permission matrix and the effective-permissions inspector.
- **`<slice>/`** — the components that actually fetch and mutate for a feature.
- **May not import `api-client`.** Reads go through `query` so that invalidation always has something to invalidate. A direct client call in a component is a read no mutation will ever refresh.
- **May not import `@tanstack/react-router`.** Same rule as `ui`, same reason.
- **Smell:** `await client.…` inside a component, or a `<Navigate>`.

---

## 2.18 Inside `apps/web`

- **`src/env.ts`** — one of two `process.env` readers. Parses at module load, so a missing secret crashes at boot with a field path rather than 500ing an hour later.
- **`src/server/`** — **the entire transport layer**, and the thing that moves to `apps/api` if NestJS ever arrives. Nothing above or below it changes when it does. This is why it is one directory instead of scattered through routes.
  - **`container.ts`** — one `Container` at module scope. Per-request construction would open a connection pool per request.
  - **`orpc/base.ts`** — the shared context type, `principalMiddleware`, and the `authed` base. The middleware calls `PrincipalBuilder`, never Better Auth, and fails closed on any procedure with no permission mapping.
  - **`orpc/<subject>.router.ts`** — three lines per procedure: pull the use-case off the container, call `execute`, return.
  - **`orpc/error.interceptor.ts`** — the one place `DomainError.code` becomes a transport code.
  - **`rpc-client.ts`** — the in-process client for SSR, which skips serialisation but runs the same middleware.
- **`src/route/`** — composition only. Loaders reach the server through `ApiClient`, never by importing `appRouter`.
  - **`api/`** — two mounted fetch handlers, one for oRPC and one for Better Auth.
  - **`-guard.ts`** — route gating. The leading hyphen is TanStack's marker for "not a route"; framework naming wins inside this directory.
  - **`__root.tsx`** — the composition point: both stylesheets, the pre-hydration theme script, and all four providers.
- **Smell:** a router handler longer than three lines; `createServerFn` wrapping a business operation; `import { appRouter }` in a loader.

---

## 2.19 Inside `apps/worker`

- **`src/env.ts`** — the second and last `process.env` reader. Parses a **smaller** schema than the web app's: no `AUTH_SECRET`, because the worker never issues or validates a session. Sharing one schema between the apps would hand the worker a secret it has no use for.
- **`src/main.ts`** — construct the container, start the bootstrap, register signal handlers. Graceful shutdown is not optional: killing mid-job leaves it stalled until BullMQ's lock expires.
- **`system-principal.ts`** — three named grants, checked against `PermissionRegistry` at boot. **Never a wildcard.** A wildcard here turns any bug that lets user input reach a job path into full privilege escalation.
- **`consumer/`** — one file per queue. Each is a thin adapter, exactly like an oRPC router: deserialise, build a principal, call a use-case. Handlers let errors throw, because BullMQ's retry is driven by rejection.
- **`schedule/`** — repeatable jobs, each with a fixed `jobId` so registration is idempotent across restarts. Cron never runs in the web process, because two web instances means every schedule fires twice.
- **Smell:** a `try/catch` that swallows a job failure; a wildcard principal; an HTTP server.

---

## 2.20 Inside `apps/desktop`

- **`src/config.ts`** — `Config`, reading `import.meta.env`. **Not** a `process.env` reader, because there is no Node runtime in a webview. Everything here is baked into the shipped bundle and readable by anyone who unzips the app, so it holds base URLs and flags and **never** a secret.
- **`src-tauri/src/token.rs`** — the OS keychain commands, and the only place a credential is stored. The token never touches `localStorage`, where an injected script could read it.
- **`src/token-provider.ts`** — `TauriTokenProvider`, implementing the abstract `TokenProvider` from `api-client` in two methods, `get()` and `set()`. This file plus `BearerAuthStrategy` is the *entire* difference between the desktop client and the browser client.
- **`src/router.tsx`** — its own `@tanstack/react-router` instance on memory or hash history, because the webview serves from a custom protocol with no server to resolve a cold path against. Its own route tree; **not** its own paths — destinations come from `ROUTES` in `permissions`, and keeping the strings identical to web's is what lets a `<Link>` inside a `feature` component be correct in both shells.
- **Holds no container.** No `composition`, no `application`, no `db`, no `auth`. It is a client, and the server-only ESLint boundary applies here with no escape hatch at all — unlike `apps/web` there is no `src/server/**` to exempt.
- **Smell:** a `process.env` reference; a secret in `config.ts`; a hand-written route path; anything imported from `composition` or `application`.

---
# Part 3 — One feature, end to end

**Task reactivation.** A closed task can be reopened, but only by someone holding `task.reactivate` on that goal, and only if the task is not locked from its assignee. Reactivating writes an audit entry and re-indexes the task for search.

Small enough to hold in your head; large enough to touch every package.

## Every file it creates

Nothing here required a decision about *where* — each path falls out of "module: `task`, action: `reactivate`, layer: X."

```
packages/permissions/src/catalog/task.permissions.ts        "task.reactivate"  (scope: goal)
packages/permissions/src/catalog/index.ts                   ← register the fragment
packages/permissions/src/gate/task.gate.ts                  module gate for the nav item

packages/contracts/src/task/task.contract.ts                TaskContract.reactivate
packages/contracts/src/task/task.entity.ts                  TaskEntity.isLockedFromAssignee()
packages/contracts/src/task/task.procedures.ts              TaskProcedures.reactivate
                                                              .route POST /tasks/{taskId}/reactivate
packages/contracts/src/contract-router.ts                   ← register
packages/contracts/src/permission/task.permissions.ts       "task.reactivate" → task.reactivate

packages/application/src/task/task.repository.ts            TaskRepository          (port)
packages/application/src/task/reactivate-task.use-case.ts   ReactivateTaskUseCase.execute()
packages/application/src/task/overdue-lock.policy.ts        OverdueLockPolicy

packages/db/src/task/task.schema.ts                         tasks.reactivated_at
packages/db/src/task/pg-task.repository.ts                  PgTaskRepository
packages/db/migrations/0004_task_reactivation.sql           ← + seeds the permission row

packages/query/src/task/task.mutations.ts                   TaskMutations.reactivate()
packages/query/src/task/task.queries.ts                     TaskQueries.detail(taskId)

packages/content/src/message/en/task.ts                     labels, confirm copy, error text

packages/feature/src/task/reactivate-task.dialog.tsx        <ReactivateTaskDialog />

apps/web/src/server/orpc/task.router.ts                     TaskRouter.reactivate
apps/web/src/server/orpc/app.router.ts                      ← register
apps/web/src/route/task/$taskId.tsx                         composes the dialog

apps/worker/src/consumer/embedding.consumer.ts              ← already exists, no change

packages/composition/src/container.ts                       ← expose the use-case
```

**The migration is what makes the feature appear.** Until it seeds `task.reactivate` and grants it to the right roles, the button is invisible and the endpoint returns `FORBIDDEN` for everyone. That is the staged-rollout mechanism working as designed.

## Flow 1 — rendering the page

```
Browser requests /task/abc123
        │
        ▼
apps/web  route/task/$taskId.tsx
        │  beforeLoad → RouteGuard.requireSession()
        │  loader     → ApiClient (in-process on SSR, HTTP in the browser)
        ▼
apps/web  server/orpc/base.ts
        │  principalMiddleware
        │    → auth  PrincipalBuilder.fromHeaders()
        │        → auth  BetterAuthSessionResolver     (who is this?)
        │        → auth  CapabilityCache               (Redis, 60s backstop)
        │            └ miss → db  PgCapabilityRepository  (3 queries)
        │    → contracts  ProcedurePermissions.required("task.get")
        ▼  Principal { userId, CapabilitySet }
apps/web  server/orpc/task.router.ts        ← three lines
        ▼
application  GetTaskUseCase.execute(principal, input)
        │  1. load     → TaskRepository (port)  ──► db  PgTaskRepository
        │  2. authorize → Authorizer.assert(principal, "task.read", goalId)
        │  3. work     → TaskEntity
        ▼  TaskDto
        ▼
Back through the router. SSR serialises the DTO **and** the CapabilitySetDto
into the HTML payload, so the first paint already knows what to hide.
        ▼
feature  <TaskDetail> → ui  <Can permission="task.reactivate" goalId={…}>
                              ui  <Button> "Reactivate"
```

**Note what the loader did not do**: it did not import `appRouter`, and it did not make an HTTP call to its own server. `ApiClient.inProcess` skips serialisation but runs the *same* middleware and the *same* `Authorizer.assert()`.

## Flow 2 — the mutation

```
User clicks Reactivate
        ▼
feature  <ReactivateTaskDialog>
        │  reads copy from content  message/en/task.ts
        ▼
query  TaskMutations.reactivate()          ← useAppMutation, declares its invalidations
        ▼
api-client  ApiClient.task.reactivate({ taskId, reason })
        │  auth/  CookieAuthStrategy   (web)  ─┐
        │         BearerAuthStrategy   (desktop) ┘  same call site
        ▼  POST /api/rpc  →  /tasks/{taskId}/reactivate
apps/web  route/api/rpc.$.ts
        ▼  principalMiddleware  (identical to Flow 1)
apps/web  server/orpc/task.router.ts
        ▼
application  ReactivateTaskUseCase.execute(principal, input)
        │
        │  1. LOAD       TaskRepository.findByIdOrFail(taskId)
        │  2. AUTHORIZE  Authorizer.assert(principal, "task.reactivate", task.goalId)
        │                  └ fails → ForbiddenError        ◄── THE gate
        │  3. WORK       OverdueLockPolicy + TaskEntity.reactivate(clock.now())
        │                  └ fails → ConflictError
        │  4. PERSIST    UnitOfWork
        │                  ├ TaskRepository.save(task)      → db
        │                  └ ActivityLogger.log("task.reactivated")  → db
        │  5. ENQUEUE    QueuePublisher.publish("embedding.generate", …)
        │                  → infrastructure  BullMqQueuePublisher → Redis
        ▼  TaskDto
apps/web  server/orpc/error.interceptor.ts
        │  DomainError.code → ORPCError     (ForbiddenError → FORBIDDEN)
        ▼
query  invalidates ["task","detail",id] and ["task","list"] — declared, not remembered
        ▼
UI re-renders
```

Then, independently:

```
Redis  embedding.generate
        ▼
apps/worker  consumer/embedding.consumer.ts
        │  SystemPrincipal.forOrganisation(orgId)   ← three named grants, never a wildcard
        ▼
application  IndexTaskUseCase.execute(systemPrincipal, …)
        │  → EmbeddingProvider (port) → infrastructure  OpenAiEmbeddingProvider
        │  → VectorStore       (port) → db              PgVectorStore
        ▼  row in task_embeddings
```

**The worker never touched `principalMiddleware`** — which is precisely why `Authorizer.assert()` inside the use-case is the real gate and the middleware is defence in depth.

## Flow 3 — one decision, four surfaces

An admin removes `task.reactivate` from the Manager role. Nobody deploys anything.

```
db  role_permissions row deleted
        ▼
auth  CapabilityCache invalidated for every affected user
        ▼
        ├── ui       <Can>              → button disappears
        ├── apps/web RouteGuard         → /task/…/reactivate redirects to /forbidden
        ├── content  nav (module gate)  → menu entry disappears
        └── application Authorizer      → API returns FORBIDDEN
```

**Four surfaces, one `CapabilitySet.can()`, zero frontend changes.** The first three are convenience. The fourth is security. That ranking is the reason `permissions` has no database access and no async methods — it is the one artifact all four surfaces can share.

## What the example demonstrates

**Every filename was derivable.** Not one required looking up a precedent — module plus action plus layer produced all twenty-three paths.

**The domain layer imported no framework.** `ReactivateTaskUseCase` names `TaskRepository`, `UnitOfWork`, `ActivityLogger`, and `QueuePublisher` — all abstract. It can be tested with four fakes and a `FixedClock`, and it would run unchanged under NestJS.

**Every use-case followed load → authorize → work → persist.** Authorization is step two, in the use-case, every time. Never in middleware, never in a router, never only in the UI.

**Swapping anything is local.** Postgres → another SQL database: `db` only. pgvector → Qdrant: one line in `container.ts` plus a new store class. TanStack Start → NestJS: `apps/web/src/server/` moves and the error interceptor becomes an exception filter. Web → desktop: one `AuthStrategy` swap ([30](30-desktop-app.md)).

---

## ✅ Gate

Given a feature name and a layer, you can write the file path and the class name without looking anything up — and for any file in the tree, you can say what it must not contain.

---

[← Folder Structure](28-folder-structure.md) · [`apps/desktop` →](30-desktop-app.md)

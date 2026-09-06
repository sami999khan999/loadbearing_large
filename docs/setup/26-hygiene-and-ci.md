# 26 · Hygiene and CI

> Hooks that catch mistakes before they leave your machine, and a pipeline that catches the ones that get past them.

**Delivers:** Pre-commit formatting, conventional commits scoped to real packages, and a CI job that enforces the three architectural rules a type checker cannot see.

**Prerequisite:** [25 · `apps/worker`](25-worker-app.md)

---

## Step 26.1 — Hooks

```bash
pnpm add -Dw husky lint-staged @commitlint/cli @commitlint/config-conventional
pnpm exec husky init
```

**`.husky/pre-commit`**

```sh
pnpm exec lint-staged
```

**`.husky/commit-msg`**

```sh
pnpm exec commitlint --edit "$1"
```

**`.lintstagedrc.json`**

```json
{
  "*.{js,jsx,ts,tsx,json,jsonc,css}": ["biome check --write --no-errors-on-unmatched"]
}
```

> [!CAUTION]
> **Do not add a `*.{md,yml,yaml}` entry for Biome.** Biome does not format Markdown or YAML —
> verified on 2.5.7, where `biome format` on a `.md` or `.yaml` file reports
> `Checked 0 files`. Combined with `--no-errors-on-unmatched`, such an entry is a **silent
> no-op**: the hook reports success and formats nothing.
>
> Dropping Prettier therefore left Markdown and YAML formatted by no tool at all. That is fine
> for hand-wrapped prose — it is why `docs/` was excluded from Prettier in the first place — but
> know that it is the situation rather than discovering it from an inconsistent diff. If you
> want them formatted, add a dedicated formatter (`prettier --write "**/*.{md,yml,yaml}"` as a
> separate devDependency scoped to those extensions only) and give it its own lint-staged entry.

**`lint-staged` runs on staged files only**, so a commit touching two files takes a second rather than linting 14 packages. Do not add `tsc --noEmit` here — type checking is inherently whole-project and would make every commit take a minute. That belongs in CI.

**Biome only in the hook — no ESLint.** Biome finishes in milliseconds; ESLint's typed rules need a whole program and would put ten seconds on every commit. A hook that slow gets disabled, and a check that runs is worth more than a thorough check that doesn't.

**`--no-errors-on-unmatched`** stops the hook failing when a staged file is one Biome does not handle.

**`.husky/pre-push`** is where the slow pass goes:

```sh
pnpm exec eslint .
```

ESLint's six architecture rules still block a merge — they run here and in CI, not on every commit.

> [!NOTE]
> ESLint 9 resolves flat config from the **working directory** rather than per file. With a single root config ([05](05-lint-and-format.md)) that is a non-issue: both this hook and CI run `eslint .` from the repo root, so there is exactly one config and one rule set.

---

## Step 26.2 — Commit scopes

**`commitlint.config.js`**

```js
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "core", "permissions", "contracts", "application", "db", "infrastructure",
        "auth", "composition", "asset", "content", "api-client", "query", "ui", "feature",
        "web", "worker", "desktop",
        "tooling", "infra", "docs", "deps", "repo",
      ],
    ],
    "scope-empty": [2, "never"],
  },
};
```

```
feat(permissions): add goal-scoped intersect
fix(db): index capability lookup by user_id
chore(deps): bump drizzle-orm
```

**A closed scope list is the point.** It forces a decision — *which package does this change belong to?* — at commit time. A commit that genuinely spans six packages usually wants splitting, and the enum is what surfaces that. It also makes `git log --grep "(permissions)"` a usable ownership tool, which pairs directly with the team ownership model: one team, one glob, one scope.

**Update this list whenever you add a package.** A rejected commit is the reminder.

---

## Step 26.3 — The pipeline

**`.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_USER: ratchet
          POSTGRES_PASSWORD: ratchet
          POSTGRES_DB: ratchet_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U ratchet"
          --health-interval 5s --health-timeout 5s --health-retries 10
      redis-cache:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s --health-timeout 5s --health-retries 10
      redis-queue:
        image: redis:7-alpine
        ports: ["6380:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s --health-timeout 5s --health-retries 10

    env:
      DATABASE_URL: postgres://ratchet:ratchet@localhost:5432/ratchet_test
      REDIS_CACHE_URL: redis://localhost:6379
      REDIS_QUEUE_URL: redis://localhost:6380
      APP: ci
      ENV: test

    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build:packages
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm --filter @loadbearing/web build # required by check:architecture rule 3
      - run: pnpm check:architecture
```

> **CI runs neither Loki nor Alloy, and that is the correct choice rather than an omission.** Both are a [Tier 0](../opinions/dependencies.md) platform dependency: no package imports them, so no test can fail because they are absent. What CI does need is `APP` and `ENV`, because they are read by `env.ts` like any other config — a missing one is a startup crash, and finding that out in CI is the entire point.
>
> ClickHouse is absent for a different reason. Its adapters *are* written, but nothing in the unit
> tiers touches them — `ClickHouseAnalyticsProjector` is covered by the smoke check, which runs
> against live containers by hand and is not a CI job ([15](15-infrastructure-package.md)). If that
> ever becomes a CI job, ClickHouse joins the service list; until then a container CI starts and
> nothing asserts against is cost with no signal.

> [!CAUTION]
> **That web build is not optional.** `check:architecture`'s third assertion greps the built *client* output for server-only fingerprints. `build:packages` filters to `./packages/*` and never builds `apps/web`, so without this step the grep runs over a directory that does not exist — it passes silently and gives you permanent false confidence that no server code is reaching the browser.
>
> This is exactly the failure the note in Step 26.4 warns about, and the pipeline is where it actually bites. Make the script fail when it finds zero asset files, so a missing build is loud rather than green.

**Services, not Docker Compose.** GitHub's `services` block gives health-checked containers on localhost with no compose file to keep in sync. The `pgvector` image is required — the vector migration will not apply on stock `postgres:17`.

**`fetch-depth: 0`** gives you full history. Shallow clones break any future `--filter` or changed-files logic, and debugging that in CI is miserable.

**`--frozen-lockfile`** fails the build if `pnpm-lock.yaml` does not match `package.json`. That is the whole reason to commit a lockfile.

**pnpm 11 has a `pnpm ci` command** (`pnpm clean` followed by a frozen install). It is the better choice on a runner with a persistent workspace; on GitHub's ephemeral runners there is nothing to clean, so the explicit form above costs nothing and reads more clearly.

**`pnpm/action-setup` still installs pnpm**, but with `devEngines.packageManager` in `package.json` the version it installs barely matters — pnpm resolves the pinned version from the lockfile on first invocation. Leave the action's `version` input unset so the two cannot disagree.

**Order matters.** Build before typecheck, because packages consuming `dist/` types need them to exist. Lint before test, because a lint error is a two-second answer and a failing test suite is a two-minute one.

---

## Step 26.4 — The fifteen architectural assertions

Types cannot express "this package must not import that one across a bundle boundary". Fifteen greps can.

**`tooling/scripts/check-architecture.mjs`** — add `"check:architecture": "node tooling/scripts/check-architecture.mjs"` to the root scripts. Zero dependencies, plain Node, and it prints one line per assertion:

```
✓ `application` imports no framework
✓ every `@orpc/*` entry is on one version line
✓ comments are `//`, never a block
○ no server code in the client bundle — skipped: apps/web has no client build
```

> [!IMPORTANT]
> **A skipped assertion prints `○`, never `✓`.** Two of these depend on artefacts that may not exist yet — a built `dist/`, a built client bundle — and an assertion that quietly passes when it did not run is worse than no assertion, because it converts an unknown into a false guarantee. The same reason the bundle check fails rather than passes when it finds zero asset files.
>
> **Write the failing case before you trust any of them.** Each of the twelve runnable assertions here was verified by introducing its violation and watching it fail: a `drizzle-orm` import in `application`, a `process.env` read outside `env.ts`, `@orpc/server` skewed back to `^1.13.7`, a block comment in `src/`, a top-level `await` appended to a built barrel. A grep nobody has seen fail is a grep nobody should believe.

### 1 — `application` imports no framework

```js
// fail if packages/application/src/** imports any of these
const BANNED = ["@orpc/", "@tanstack/", "drizzle-orm", "ioredis", "bullmq", "@aws-sdk/", "better-auth"];
```

`application` defines ports and use-cases. The moment it imports `drizzle-orm`, the dependency inversion is decorative — you can no longer test a use-case without a database, and swapping an adapter means editing the domain.

**ESLint's boundary rules already cover this**, but a grep is independent of ESLint config, cannot be disabled with an inline comment, and keeps working if someone reorganises the lint setup.

### 2 — `application` does not log

```js
// fail if packages/application/src/** imports @loadbearing/observability
```

The domain layer records business facts through `ActivityLogger` and throws typed errors; diagnostics belong to the adapters ([12](12-application-package.md)). This is the grep that keeps a `logger.emit` from appearing inside a use-case under deadline, and with it the request context that would have to be threaded there to make it useful.

### 3 — Only `env.ts` reads `process.env`

```js
// fail on any process.env outside apps/*/src/env.ts
```

Every other `process.env` read is an unvalidated string that becomes `undefined` in production. This rule is what makes the `Env` classes trustworthy — it is not a style preference, it is the enforcement of a single validated boundary.

> [!IMPORTANT]
> **This exemption list and Biome's `noProcessEnv` overrides must stay in step.** They are two
> statements of the same rule in two tools, and a path exempted in one and not the other is either a
> gate that passes while the rule is broken, or a build that fails for no reason. The set is:
> `apps/*/src/env.ts`, any `*.config.*`, and the four runnable scripts above `src/` —
> `infrastructure/{migrate,seed,smoke}.ts` and `auth/tables.ts`, the last being schema inspection
> run by hand against a throwaway URL
> ([16](16-auth-package.md)), which had a Biome exemption and no matching one here.

### 4 — Every `@orpc/*` entry is on one version line

```js
// fail if the @orpc/* entries in pnpm-workspace.yaml carry more than one range
```

They pin `@orpc/shared` **exactly** rather than with a caret, so a skew puts two copies of it in the tree. `syncpack lint` cannot see this: it checks that one dependency carries the same range across packages, and has no concept of a group that must move together. The catalog's tiering ([03](03-workspace-and-catalogs.md)) deliberately splits these entries across two tiers for portability reasons, which makes an automated check the only thing holding them level.

Worth writing because it already happened: the catalog shipped `@orpc/server` at `^1.13.7` under a comment reading *"pin all four together"*, and every check in the repository passed.

### 5 — Comments are `//`, never a block

```js
// fail on any line in {packages,apps}/*/{src,tests} whose trimmed form starts with /* or {/*
```

[Opinions · Comments](../opinions/comments.md) bans block comments outright, and neither Biome nor ESLint ships a rule that expresses it. Anchoring to the start of a trimmed line is what makes this safe: Biome always formats a block comment onto its own line, so a glob like `"**/dist/**"` inside a string cannot be mistaken for one.

**It walks `apps/*` as well as `packages/*`, and it matches the JSX form.** Both were gaps rather than decisions: an assertion about how source is written has no reason to stop at `packages/`, and `{/* … */}` is the form a React file reaches for — twenty-two of them were invisible to this check until it named the shape. The JSX replacement is an expression container holding `//` lines.

Generated files are skipped by name (`*.gen.ts`, `*.gen.tsx`). `apps/web/src/route-tree.gen.ts` asks in its own header to be excluded from every checker pointed at it, and it is written by the route generator rather than by anyone.

### 6 — No top-level `await` in a built barrel

```js
// fail on /^(await |(var|let|const) \w+ = await )/ in any packages/*/dist/index.js
```

The default NestJS and Express scaffold is CommonJS, and a CJS consumer reaches an ESM package through `require(esm)` — unflagged on Node 22.12+, which this repo's `engines` floor guarantees. It refuses any module graph containing a top-level `await`.

So a TLA in a package barrel breaks every CJS consumer, with an error naming the wrong thing. Nothing today has one; this is what keeps it that way. **Skips when no `dist/` exists**, so run it after `build:packages`.

### 7 — `"use client"` only in `ui`, `query`, `feature`

```js
// fail on /^\s*["']use client["']/m in any other package's src/
```

The dangerous direction is not a missing directive — that fails loudly at the consumer's build. It is a directive added to an isomorphic package to make one import stop complaining, which silently breaks SSR of translated copy and authorization inside a Server Component ([06](06-package-anatomy.md)).

### 8 — No server code in the client bundle

```bash
pnpm --filter @loadbearing/web build
# then grep the client output for server-only fingerprints
```

```js
// Absent from the WHOLE client output.
const FINGERPRINTS = ["drizzle-orm", "pg-pool", "@aws-sdk/client-s3", "ioredis", "bullmq"];

// Absent from the ENTRY chunk. A locale string in a lazily-loaded chunk is correct.
const ENTRY_FINGERPRINTS = ["সংরক্ষণ"];

// Absent from the whole client output, like the server list above.
const EMAIL_FINGERPRINTS = ["email.digest."];

// Field names from the `env.ts` schemas. Also absent from the whole client output.
const ENV_FINGERPRINTS = [
  "REDIS_QUEUE_URL",
  "S3_FORCE_PATH_STYLE",
  "AUTH_COOKIE_CACHE_MAX_AGE_SECONDS",
];
```

**This is the third defence** from [05](05-lint-and-format.md) and the only one that inspects reality. ESLint catches direct imports; `ServerOnly.assert()` catches execution; this catches the case where a transitive re-export drags Drizzle into a component chunk. Grep the client assets only — the SSR bundle contains all of these legitimately.

> [!CAUTION]
> **`ENV_FINGERPRINTS` was added after this assertion passed a build that shipped the entire server
> configuration schema to the browser.** `apps/web/src/env.ts` imports **no** server-only package —
> just `zod` — so every fingerprint above was legitimately absent while `DATABASE_URL`,
> `AUTH_SECRET` and `S3_SECRET_KEY` sat in the entry chunk, followed by a `Schema.parse({})` that
> threw before the app could hydrate ([24](24-web-app.md) Step 24.2).
>
> **A file can be server-only without importing anything server-only.** Fingerprinting the
> *dependencies* only catches a leak that drags a dependency with it; the names of the fields are
> what identify the file itself.
>
> The real fix is upstream — `env.ts` carries `import "@tanstack/react-start/server-only"`, so Start's
> import-protection plugin now **fails the build** and names the file and line. This grep is the
> backstop for anything that gets around the marker, which is why it belongs here anyway.

> [!IMPORTANT]
> **Two greps, not one, because "absent" means different things.** A server fingerprint must not
> appear anywhere in the client output. A **locale** fingerprint is different: a Bengali string
> inside a lazily-loaded chunk is the split working exactly as designed
> ([20](20-content-package.md)) — it is only a failure in the **entry** chunk, because that is
> what "not a static import" means in practice. Assert against the entry chunk specifically, and
> have the script fail if it cannot identify one, for the same reason the note below says to
> fail on zero asset files.
>
> `email.*` goes back in the strict list. No client chunk, eager or lazy, has any business
> carrying the worker's copy — the ESLint ban in [05](05-lint-and-format.md) Step 5.3 should
> have stopped it, and this is what catches a transitive path around the ban.

Shipping database driver code to the browser is not just a 400KB regression. It means your connection string's *shape* and your full schema are readable in devtools.

> **Point the grep at the client output directory for your Vite version.** The path differs between Start versions; confirm it once and assert on the correct directory — a grep over an empty folder passes silently and gives you false confidence forever. Have the script fail if it finds zero asset files.

### 9 — Every domain table declares `organization_id`

```js
// fail on any pgTable(...) in packages/infrastructure/src/pg/schema/** whose body has no organization_id,
// unless its table name is on the exemption list
const TENANT_EXEMPT = new Set([
  "organizations",                                   // it is the tenant
  // Better Auth's, and global by nature: one person has one login and may belong
  // to several organizations, so the tenant lives on `memberships`. These are the
  // `modelName` values doc 16 chose — Better Auth's own defaults are singular.
  "users", "accounts", "verifications", "two_factors",
  "__drizzle_migrations",
  "activity_archive",                                // partitioned by time, not tenant
]);
```

`organization_id` is the sharding key and the tenant boundary ([13](13-infrastructure-postgres.md)). A table that ships without it is not a style problem — it is a table that has to be migrated under load later, and a query that cannot be scoped to a tenant in the meantime.

**The exemption list is the point of the check, not a weakness in it.** Every entry is a decision someone had to write down: Better Auth's tables are exempt because a login is global, and `organizations` is exempt because it *is* the tenant. Adding another entry means arguing for it in review, which is exactly the conversation that should happen before a global table exists.

> [!WARNING]
> **Names on this list are the `modelName` values, not Better Auth's defaults.** [16](16-auth-package.md) renames all five to this repository's plural convention, and a list still reading `user`/`session`/`account` exempts *nothing* — the assertion silently passes on tables it was never checking. Verify the list the way every assertion here is verified: add a table with no `organization_id`, watch it fail, remove it.
>
> `sessions` is deliberately absent, because it genuinely carries the tenant — `activeOrganizationId`, pinned at sign-in ([16](16-auth-package.md)).

Note this cannot be a type-level rule. Drizzle table definitions are data, `pgTable` returns the same type whichever columns you pass, and there is no compile error available — which is precisely the category of rule this file exists for.

### 10 — The audit port is `ActivityLogger`

```js
// fail on the identifier AuditTrail anywhere in packages/** or apps/**
```

Cheap, and it exists because the name drifted once already: the observability docs said `AuditTrail` while eleven other files said `ActivityLogger`, and nothing caught it because both are prose in Markdown until the class exists.

Two names for the audit port is worse than an ugly name. The whole point of [Data and scale](../opinions/data-and-scale.md) §1 is that a business fact and a diagnostic go to different places for different reasons, and a reader who sees two names reasonably assumes there are two things.

### 11 — The schema barrel names every `*.schema.ts`

```js
// fail if packages/infrastructure/src/pg/schema/index.ts omits any sibling *.schema.ts
```

**An incomplete barrel passes typecheck, lint, build, and every test.** `import * as schema` from a module that re-exports nothing is legal and yields `{}`. The only tool that notices is drizzle-kit, and it notices by generating `DROP TABLE` for every table it can no longer see. That happened once; this is the guard.

It is the one assertion whose failure mode is a destructive migration rather than a broken build, which is why it greps the barrel rather than trusting the [`noReExportAll` exemption](../opinions/imports.md) that makes the star export legal there in the first place.

### 12 — The rule files route to every opinions page

```js
// fail if a docs/opinions/*.md page is cited by no file in docs/ai/rules/,
// if a rule file is routed to from neither AGENTS.md nor docs/ai/rules/index.md,
// or if any of them routes to a path that does not exist
```

[`docs/ai/rules/`](../ai/rules/index.md) is a digest of [`docs/opinions/`](../opinions/index.md) — the rules an agent must know *unprompted*, one file per topic, none over ~650 tokens. `AGENTS.md` at the repository root is a router and nothing else: one row per task, pointing at the file that answers it.

A digest is a second copy of every rule it states, and the failure is not that it is wrong the day it is written. It is that a tenth opinions page lands months later, no rule file mentions it, and every agent works from a rulebook missing a chapter while nothing says so. Citing the path is the cheapest thing that cannot be forgotten silently.

**Three links, all checked.** A page nothing cites is the missing chapter. A rule file nothing routes to is the same failure from the other end — it exists, it is correct, and no agent will ever open it. And a route to a renamed page sends a reader nowhere.

> [!WARNING]
> **Match Markdown link targets, not just backticked paths.** The first version of this assertion greped only for `` `docs/…md` `` and a deleted rule file passed clean: `AGENTS.md` links its rule files as Markdown targets rather than backticked paths, which that pattern never saw, and a second file citing the same opinions page hid the gap. Verified against six break shapes — an uncited page, an orphaned file, a renamed target, a deleted rule file, a root file that stops pointing, and a broken relative link inside a rule file.

**This is [Simplicity](../opinions/simplicity.md) applied to documentation.** The split is a real cost — twelve files to keep in step instead of one — and it is paid so that nothing loads what a task does not need. What is *not* negotiable is that the copy stays in step, and "stays in step" is a promise no reviewer reliably keeps.

It does **not** check that a rule file's summary of its page is still *accurate*. That is why every file in `rules/` ends with the line saying `docs/opinions/` wins any disagreement.

### 13 — Every folder under `docs/` has an `index.md`

```js
// fail if a folder under docs/ holds Markdown pages and no index.md
```

The same rule as `index.ts` one level down, for the same reason. A folder with no index can only be navigated by listing it, and a reader who lands in one has to guess which file is the entry point. The index is also what lets a page move within a folder without every link *to* the folder breaking — the identical argument [Folders](../opinions/folders.md) makes about barrels.

**The `reference/` folders are exempt, and the exemption is a decision rather than an oversight.** `packages/<name>/docs/reference/` and `docs/infra/reference/` are reached from their parent `index.md`, which names every page in them, with `meta.json` carrying the order. An index inside would restate the parent and rot the first time a page landed in one and not the other. The exemption is **by folder name**, not by location — `docs/infra/reference/` sits inside `docs/` and earns it for the identical reason. A folder holding no Markdown is skipped too; there is nothing for an index to name.

Cheap, and it caught three gaps the moment it was written: `docs/` itself, `docs/ai/skills/`, and `docs/setup/`, which had thirty-one numbered documents and no contents page.

### 14 — No comment block over two lines

```js
// fail on three or more consecutive lines whose trimmed form starts with //
```

The other half of [Opinions · Comments](../opinions/comments.md), and the half nothing checked. The two-line ceiling was a convention for as long as it was unenforced, and the tree answered accordingly: 524 blocks over it across seventeen packages, one of them twenty-four blocks in a single file.

**A run ends rather than extends at anything carrying no prose** — a `// ──` separator, and a `// biome-ignore`, `// eslint-disable` or `// @ts-` pragma. That is what lets an `import.ts` keep a one-line header above each of its separators without the whole file reading as one enormous block, and it is why the exemption is a property of the *line* rather than a per-file opt-out. There is no way to silence this assertion from inside a file, which is the point.

Scope is the same as §5: `{src,tests}` under `packages/*` and `apps/*`, generated files skipped.

> [!NOTE]
> **`pnpm check:comments` is the companion report, and it never fails.** `tooling/scripts/comment-density.mjs` prints per-package comment percentage, block count and the twenty-five files carrying the most comment lines. A package drifting toward the ceiling is visible there long before any single file trips §14 — and after the phase-1 sweep the tree sits at 13 % overall with zero blocks.

### 15 — Every backticked path in the docs exists

```js
// fail if a backticked repo-relative path in docs/**, README.md, AGENTS.md or a
// package's docs/** names nothing on disk
```

The cheapest kind of documentation rot and the one a reader trusts most: a path in backticks reads
as a fact about the tree. [15](15-infrastructure-package.md) sent people to `src/cache/` and `src/queue/` for months —
folders this repository has never had, because `infrastructure` is organised by vendor
([Layering](../ai/rules/layering.md)). Twenty-one paths were wrong when this was first run, and six
of them had been correct until a refactor moved the file and left the sentence behind.

**Three things keep it from crying wolf**, because a check with false positives teaches people to
add exemptions rather than fix paths:

- **Fenced blocks are skipped.** An ASCII tree is full of names that are not paths, and a snippet's
  imports resolve against the file it would live in, not against the repository root.
- **A page may say a path is not real, and the check believes it.** `illustrative`, `not written
  yet`, `does not exist`, `removed`, `deleted` or `☐` on the line — or on the heading above a list,
  which is what `## What this removed` in [05](05-lint-and-format.md) is. A collapsed `<details>`
  block is skipped whole: it is the one place a page deliberately shows a tree that is gone.
- **A `docs/reference/<page>.md` span resolves against the package that wrote it.** The opinions pages say "the
  package's `docs/reference/`" generically, so the span passes if any package has one.

`apps/desktop` and `apps/api` are exempt by name. Both appear only in sentences about what *would*
move there, and doc [30](30-desktop-app.md) is a plan for one of them.

---

## Step 26.5 — Optional but worth it

- **`actions/cache`** on the pnpm store and package `dist/` dirs, keyed by lockfile hash.
- **A `docker compose up` smoke job** running the real containers and a migration to catch drift the pinned CI images hide.
- **Branch protection** requiring `verify` to pass before merge — otherwise all of this is advisory.
- **A separate tag-triggered workflow for desktop builds** ([30](30-desktop-app.md)). Deliberately not part of `verify`: Tauri needs three OS runners and several minutes each. `verify` typechecks and lints `apps/desktop` through the root scripts like anything else, and does **not** compile the Rust half — so a broken `main.rs` surfaces at tag time rather than at merge.
- **`pnpm audit --audit-level high`** as a separate non-blocking job; blocking on transitive advisories you cannot fix teaches people to ignore red builds. Advisories are filtered by **GHSA** id in pnpm 11 (`auditConfig.ignoreGhsas`), not CVE.
- **`pnpm peers check`** to surface unmet peers, which pnpm 11 no longer prints as a tree during install.
- **`pnpm sbom`** if anything downstream wants a CycloneDX or SPDX bill of materials.

---

## ✅ Gate

- A commit with a bad scope (`feat(nope): x`) is rejected.
- A commit with unformatted code is auto-formatted before it lands.
- `pnpm check:architecture` passes on a clean tree.
- Adding `import { sql } from "drizzle-orm"` to a file in `packages/application/src/` fails `check:architecture`.
- Adding `process.env.FOO` to a package file fails `check:architecture`.
- The full CI job passes end to end on a fresh clone.

Do not proceed until this passes.

---

[← `apps/worker`](25-worker-app.md) · [Verification and first feature →](27-verification-and-first-feature.md)

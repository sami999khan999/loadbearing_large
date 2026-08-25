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

> **CI runs no Loki, no Alloy, and no Grafana, and that is the correct choice rather than an omission.** Those three are a [Tier 0](../opinions/dependencies.md) platform dependency: no package imports them, so no test can fail because they are absent. What CI does need is `APP` and `ENV`, because they are read by `env.ts` like any other config — a missing one is a startup crash, and finding that out in CI is the entire point.
>
> ClickHouse is absent for the stronger reason: nothing writes to it yet ([11](11-local-infrastructure.md)).

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

## Step 26.4 — The ten architectural assertions

Types cannot express "this package must not import that one across a bundle boundary". Ten greps can.

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
> **Write the failing case before you trust any of them.** Each of the nine runnable assertions here was verified by introducing its violation and watching it fail: a `drizzle-orm` import in `application`, a `process.env` read outside `env.ts`, `@orpc/server` skewed back to `^1.13.7`, a block comment in `src/`, a top-level `await` appended to a built barrel. A grep nobody has seen fail is a grep nobody should believe.

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

### 4 — Every `@orpc/*` entry is on one version line

```js
// fail if the @orpc/* entries in pnpm-workspace.yaml carry more than one range
```

They pin `@orpc/shared` **exactly** rather than with a caret, so a skew puts two copies of it in the tree. `syncpack lint` cannot see this: it checks that one dependency carries the same range across packages, and has no concept of a group that must move together. The catalog's tiering ([03](03-workspace-and-catalogs.md)) deliberately splits these entries across two tiers for portability reasons, which makes an automated check the only thing holding them level.

Worth writing because it already happened: the catalog shipped `@orpc/server` at `^1.13.7` under a comment reading *"pin all four together"*, and every check in the repository passed.

### 5 — Comments are `//`, never a block

```js
// fail on any line in packages/*/{src,tests} whose trimmed form starts with /*
```

[Opinions · Comments](../opinions/comments.md) bans block comments outright, and neither Biome nor ESLint ships a rule that expresses it. Anchoring to the start of a trimmed line is what makes this safe: Biome always formats a block comment onto its own line, so a glob like `"**/dist/**"` inside a string cannot be mistaken for one.

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
```

**This is the third defence** from [05](05-lint-and-format.md) and the only one that inspects reality. ESLint catches direct imports; `ServerOnly.assert()` catches execution; this catches the case where a transitive re-export drags Drizzle into a component chunk. Grep the client assets only — the SSR bundle contains all of these legitimately.

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
// fail on any pgTable(...) in packages/db/src/** whose body has no organization_id,
// unless its table name is on the exemption list
const TENANT_EXEMPT = new Set([
  "organizations",                                   // it is the tenant
  "user", "session", "account", "verification",      // Better Auth owns these
  "__drizzle_migrations",
]);
```

`organization_id` is the sharding key and the tenant boundary ([13](13-db-package.md)). A table that ships without it is not a style problem — it is a table that has to be migrated under load later, and a query that cannot be scoped to a tenant in the meantime.

**The exemption list is the point of the check, not a weakness in it.** Every entry is a decision someone had to write down: Better Auth's tables are exempt because it owns their schema, and `organizations` is exempt because it *is* the tenant. Adding a sixth entry means arguing for it in review, which is exactly the conversation that should happen before a global table exists.

Note this cannot be a type-level rule. Drizzle table definitions are data, `pgTable` returns the same type whichever columns you pass, and there is no compile error available — which is precisely the category of rule this file exists for.

### 10 — The audit port is `ActivityLogger`

```js
// fail on the identifier AuditTrail anywhere in packages/** or apps/**
```

Cheap, and it exists because the name drifted once already: the observability docs said `AuditTrail` while eleven other files said `ActivityLogger`, and nothing caught it because both are prose in Markdown until the class exists.

Two names for the audit port is worse than an ugly name. The whole point of [Data and scale](../opinions/data-and-scale.md) §1 is that a business fact and a diagnostic go to different places for different reasons, and a reader who sees two names reasonably assumes there are two things.

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

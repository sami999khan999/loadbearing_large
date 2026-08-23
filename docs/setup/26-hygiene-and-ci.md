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
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s --health-timeout 5s --health-retries 10

    env:
      DATABASE_URL: postgres://ratchet:ratchet@localhost:5432/ratchet_test
      REDIS_URL: redis://localhost:6379

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

## Step 26.4 — The four architectural assertions

Types cannot express "this package must not import that one across a bundle boundary". Four greps can.

**`tooling/scripts/check-architecture.mjs`** — add `"check:architecture": "node tooling/scripts/check-architecture.mjs"` to the root scripts.

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

### 4 — No server code in the client bundle

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

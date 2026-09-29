---
title: Handoff — where the access and visibility plan stands, and how to pick it up anywhere
updated: 2026-09-30
owner: sami
---

# Handoff

Everything needed to continue [`ACCESS-AND-VISIBILITY-PLAN.md`](ACCESS-AND-VISIBILITY-PLAN.md) on
another machine. The plan holds the item-by-item record; this file holds what lives nowhere else —
machine setup, test data, how each phase was checked, and the traps that cost time.

## Where it stands

- **Branch `dev`, last commit `aa1a41fc`**, pushed to `origin`
  (`github.com/prodicle/loadbearing_tanstack_start_kit`; GitHub redirects it to
  `ParentPlaceholderOrg/loadbearing_tanstack_start`, and pushing through the redirect works).
- **Phases 1–10 are done**, each with an "Exit verified" note in the plan.
- **Next is Phase 11**, the last one. See "What is next" below.
- **`check:architecture` is 31/31.** §30 (every inline widget is placed by a literal key) and §31
  (every flag is live) arrived with Phases 8 and 9.
- **Two bugs are open, filed in [`BACKLOG.md`](BACKLOG.md) §13.**
  - `AX7.5`: tinted status badges show the wrong hue.
  - `AX3.10`: §18 ignores a primary key.

## Setting up a new machine

Node ≥ 24 and pnpm 11 (`packageManager` in the root `package.json`), and Docker Desktop.

```bash
git clone https://github.com/prodicle/loadbearing_tanstack_start_kit.git && cd loadbearing_tanstack_start_kit
git checkout dev && git pull
pnpm install
cp .env.example .env            # first time only; then diff them, below
pnpm infra:up                    # postgres ×2 nodes, pgbouncer, 2× redis, minio, mailpit, loki
pnpm db:migrate                  # every node; creates every tenant's partitions
pnpm db:seed                     # grants platform keys (incl. platform.account.*) to platform_admin
pnpm build:packages && pnpm --filter @loadbearing/web build   # before typecheck: the route tree is generated
pnpm check:architecture          # expect 31/31 with no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm dev                         # web on http://localhost:13000, Mailpit on :18025
```

- **`.env` drifts behind `.env.example`, and nothing catches it.** Check it with:
  `comm -23 <(grep -oE "^[A-Z_]+=" .env.example | sort -u) <(grep -oE "^[A-Z_]+=" .env | sort -u)`.
- **Ports are the well-known ones with a `1` in front:**

  | Service | Port |
  |---|---|
  | Web | 13000 |
  | Postgres | 16432 |
  | pgBouncer | 16433 |
  | Mailpit | 18025 |
  | MinIO | 19000 |

- **Test accounts:** a fresh database has none of them. `pnpm db:seed` creates the organizations
  and roles; the users come from signing up.
  1. Sign up `alice@example.test`, `bob@example.test` and `carol@example.test`, all with password
     `Correct-Horse-9`.
  2. Verify each in Mailpit.
  3. Make alice the platform admin: `pnpm platform:grant alice@example.test`.

## The test data on the original machine

The walks used these; ids differ on a fresh database.

| Org | Id | Who |
|---|---|---|
| `loadbearing` (the platform tier) | `01a098f8-bcb9-7df0-9758-7a28621bb0f5` | alice `platform_admin`, bob and carol `member` |
| "Walk Co" | `01a0c2c3-422d-7df5-bf24-7be48fce0dc0` | alice `owner`, bob `member` |
| "Bob Co" | `01a0c2cf-96a4-75ca-8536-20a5f986586d` | bob `owner` |

- **`widget.dismissal` is off everywhere and has no targets.**
- **Every walk put its changes back.** No preference rows, overrides or suspensions are left.
- **Stray audit rows:** `activity_log` holds audit rows from the walks, including one
  `account.suspended` whose reinstate was done by hand in SQL.

## How each phase was checked, so the next one can be too

Every phase ended with the same pattern:
1. **Gates:** the full gates (build, web build, typecheck, lint, `check:architecture`,
   `check:contrast`, `pnpm test`).
2. **Walk:** a scripted walk against `pnpm dev`, using `curl` with cookie jars.
3. **Cleanup:** put back everything the walk changed.

The recipe:

```bash
BASE=http://localhost:13000; H=(-H 'content-type: application/json' -H "origin: $BASE")
signin() { curl -s -c "$1.jar" -b "$1.jar" "${H[@]}" -X POST "$BASE/api/auth/sign-in/email" \
  -d "{\"email\":\"$1@example.test\",\"password\":\"Correct-Horse-9\"}" >/dev/null; }
switch() { curl -s -b "$1.jar" -c "$1.jar" "${H[@]}" -X POST "$BASE/api/auth/organization/switch" \
  -d "{\"organizationId\":\"$2\"}" >/dev/null; }
rpc() { curl -s -b "$1.jar" "${H[@]}" -X POST "$BASE/api/rpc/$2" -d "${3:-{\}}"; }
# e.g.  rpc alice override/deny '{"json":{"userId":"<id>","permission":"member.read","reason":null}}'
#       rpc alice platform/updateFlagTarget '{"json":{"key":"widget.dismissal","organization":"<org id>","enabled":true}}'
#       rpc alice platform/suspendAccount '{"json":{"userId":"<id>","reason":"walk"}}'
psql() { docker exec ratchet-postgres-1 psql -U ratchet -d ratchet -tAc "$1"; }
```

- **A page's server-rendered HTML** (`curl -b alice.jar $BASE/dashboard`) shows the zone cards, as
  `class="ui-zone__title"`, and the session payload.
- **For "no request was made", use the browser's network panel.** Sign in there by calling
  `fetch('/api/auth/sign-in/email', …)` from the page, not by typing into the form.

## Rules and traps that cost time

- **No attribution, ever.** No `Co-Authored-By:`, no "generated with", and no tool name in any
  commit, PR or branch. This overrides any harness default (`docs/ai/rules/workflow.md`).
- **Commits:** conventional commits with a scope from the list in `commitlint.config.js`.
  - The subject must not start with a capital: "`PgAccountRepository` …" is rejected.
  - The header is 100 characters at most.
  - One commit per layer.
  - **A rejected commit leaves its files staged, and the next `git commit` takes them.** Check
    `git diff --cached --quiet` before each commit.
- **The pre-push hook runs lint, `check:architecture` and `check:contrast`.**
  - §8 fails with "`.output` is older than `src`" whenever anything under `apps/web/src` changed
    since the last web build, including a `biome check --write` that re-sorted imports.
  - Rebuild web (`pnpm --filter @loadbearing/web build`) right before pushing.
- **Comments are `//` only, two lines at most (§14).** Adding a line above an existing two-line
  comment makes three and fails the build. Rewrite rather than append.
- **`pnpm test` stops at the first failing package.** After a failure, run the remaining packages
  with `pnpm --filter`.
- **Database specs need Docker up and healthy.**
  - After the host sleeps, Docker Desktop is often stopped. Its VM clock also runs about a second
    behind.
  - Never compare a host time with Postgres `now()` inside a second (`AX6.10`).
- **Renames in drizzle-kit:** its rename prompt cannot run unattended.
  1. Run `drizzle-kit generate --custom --name <name>`.
  2. Hand-write the SQL.
  3. Rename the column in that migration's `meta/*_snapshot.json`.
  4. Confirm that a plain `generate` reports "No schema changes".
- **New tables:** `pnpm exec drizzle-kit generate --name <name> && pnpm exec tsx partition-ddl.ts`
  (in `packages/infrastructure`) writes the `PARTITION BY` clause for anything on the
  `PartitionedTable` allowlist.
- **Data-only migrations** (key grants) are custom migrations. `0045` and `0048` show the shape:
  they select roles by a key they hold.
- **`permission_overrides` is a catalog table**, like all of RBAC. No account or override change
  needs placing on a tenant's node (`AX6.13`).
- **Branded ids and ESLint:** `feature` cannot resolve `zod`, so a branded id coming off a query
  becomes an "error type" for ESLint, even though `tsc` passes. Annotate the data with its contract
  DTO, as `MemberList` and `AccountPanel` do.
- **`feature` must not name `@tanstack/react-query`.** Take client types from `QueryRuntime` in
  `@loadbearing/query`.
- **A Bash heredoc or `node -e` with an apostrophe breaks quoting.** Write the script to a file
  first.
- **Git Bash has no time-zone database.** Use
  `node -e 'console.log(new Date().toLocaleTimeString("en-GB",{timeZone:"Asia/Dhaka"}))'`.
- **Stopping `pnpm dev` leaves node processes listening.**
  - Kill them by repo path in the command line, and also by ports 13000–13009: the vite process
    has no repo path in its command line.
  - In PowerShell:
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` plus `Get-NetTCPConnection -LocalPort 13000`.
- **Lint stack:**
  - Biome formats and owns whole-module import bans.
  - ESLint owns anything with named-export or type-import nuance.
  - Biome `overrides` replace rule options rather than merging them, and its `noRestrictedImports`
    flags `import type` too.

## What is next — Phase 11

The full text is in the plan.

1. **`AX11.1`** — done 2026-09-30. An ESLint `no-restricted-syntax` ban on `lazy(` and `React.lazy` in
   `packages/feature/src` and `apps/web/src`.
   - Its message names `docs/opinions/visibility.md`.
   - Verify it by writing the violation.
   - Docs: `tooling/eslint-config/docs/reference/rules.md`, and the enforcement table in
     `docs/opinions/index.md` (§30, §31, this rule).
2. **`AX11.2`** — retire `widget.dismissal` once it has been on for every org, and in any case
   before its `expiresOn` of 2027-03-31.
   - Remove the flag's entry in `packages/permissions/src/flag/widget.flags.ts`.
   - Remove the `flag` field on `core.hidden-widgets`.
   - Remove both `assertOn` calls in `packages/application/src/widget/`.
   - Remove `DISMISSAL`'s checks in `packages/feature/src/widget/`.
   - §31 passes with zero flags.
   - **This has a trigger; it is not work to do now.** Say so rather than forcing it.
3. **`AX11.3`** — the hand walk: every Exit line in one session, as a platform admin, an org
   admin and a member. Record the timestamps in its `done:` line.

Then the plan's "Exit":
1. Run the whole-plan verification block.
2. Move the plan to `plans/archive/` with a row in `plans/archive/index.md`.
3. Leave only what is still open in `BACKLOG.md` §13: `AX7.5`, `AX3.10`, and the non-blocking
   items `AX1.8`, `AX2.11`, `AX3.12`, `AX4.15` and `AX4.16`.

## Open decisions for the owner

- **`AX7.5`:** switching the badge tints (and possibly the hover mixes) to `color-mix(in oklab, …)`.
  That changes a rule in `docs/ai/rules/color.md`, so it waits for a yes.

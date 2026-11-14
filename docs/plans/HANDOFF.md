---
title: Handoff — where the access and visibility plan stands, and how to pick it up anywhere
updated: 2026-11-12
owner: sami
---

# Handoff

Everything needed to pick up what [`ACCESS-AND-VISIBILITY-PLAN.md`](archive/ACCESS-AND-VISIBILITY-PLAN.md)
left open, on any machine. The plan holds the item-by-item record; this file holds what lives nowhere else —
machine setup, test data, how each phase was checked, and the traps that cost time.

## Where it stands

- **2026-11-12: everything that code or a browser could close is closed.** `CR.20` (the
  projection walks only tenants with new rows) and section 10 with it; the browser walks
  `UI.1`, `DC.9`, `LP.1`, `AI.2` and the benchmark `LP.3`. Before that, on 2026-11-10 to 12, the
  messaging features `26.1`, `26.3`, `26.6`, `26.7`, `26.10` and `26.11`, `RV.3` and the
  assistant's `AI.1`, `AI.3` and `AI.4`.
- **What is open is [`BACKLOG.md`](BACKLOG.md).** The walks' findings `WK.1`–`WK.7` closed the
  same day, the shell as a sidebar, and `26.4` was built, superseding D47. The rest waits on
  hardware, traffic or a trigger.
- **`check:architecture` is 32/32.** `pnpm test` runs 2,639 tests and `pnpm smoke` 56.
- The access and visibility plan, built 2026-09-28 to 30, is archived in
  [`ACCESS-AND-VISIBILITY-PLAN.md`](archive/ACCESS-AND-VISIBILITY-PLAN.md).

## Setting up a new machine

Node ≥ 24 and pnpm 11 (`packageManager` in the root `package.json`), and Docker Desktop.

```bash
git clone https://github.com/prodicle/loadbearing_tanstack_start_kit.git && cd loadbearing_tanstack_start_kit
git checkout dev && git pull
pnpm install
cp .env.example .env            # first time only; then diff them, below
pnpm infra:up                    # postgres, pgbouncer, 2× redis, minio, mailpit, loki — see below
pnpm db:migrate                  # every node; creates every tenant's partitions
pnpm db:seed                     # grants platform keys (incl. platform.account.*) to platform_admin
pnpm build:packages && pnpm --filter @loadbearing/web build   # before typecheck: the route tree is generated
pnpm check:architecture          # expect 32/32 with no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm dev                         # web on http://localhost:13000, Mailpit on :18025
```

- **`infra:up` alone is not enough for a `.env` that names more nodes.** One that sets
  `DATABASE_SHARD_1_*`, `DATABASE_REPLICA_URL`, `CLICKHOUSE_URL` and a cold tier needs every
  matching profile, or `db:migrate` fails dialling 15433, and smoke and the analytics procedure
  fail on `fetch failed`:
  `node tooling/scripts/compose.mjs --profile observability --profile sharded --profile replica --profile analytics --profile cold-tier up -d`,
  then `pnpm ch:migrate`.
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
  2. Verify each in Mailpit. Mailpit's text part ends each line in `\r`, so strip it before
     following a link with `curl`.
  3. Make alice the platform admin: `pnpm platform:grant alice@example.test`.
  4. Sign each one in. Under `AUTH_ENROLMENT_MODE=personal` that first sign-in founds an org of
     their own. Alice gets none, because the grant already gave her a membership.
  5. For a member, have bob invite carol (`member/invite`). Carol then accepts through
     `POST /api/auth/invitation/accept` with the token from the mail, since she already has an org.

## The test data on the original machine

The walks up to Phase 10 used these; ids differ on a fresh database. The `AX11.3` walk ran on a
second machine, with alice as platform admin, bob owning "Bob", and carol a member there.

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
- **Without the browser extension, drive headless Chrome over the DevTools protocol.** Node's
  built-in `WebSocket` is enough. Copy the cookie jar in with `Network.setCookie`, then record
  `Network.requestWillBeSent`. That is how `AX11.3` checked the network panel lines.
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
- **`pnpm dev` can die mid-session.** On 2026-09-30 the web process got SIGTERM with no cause
  in its log, and `--parallel` took the worker and realtime down with it. Check the task, restart
  it, and redo the step that came back empty.
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

## Walking in a browser without the extension

The 2026-11-12 walks drove Playwright's cached Chromium
(`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome --headless=new
--remote-debugging-port=9333`) over the DevTools protocol, with Node's built-in `WebSocket`:
navigate, `Runtime.evaluate` with `replMode: true` for top-level `await`, `Input.dispatchKeyEvent`
(Enter needs `text: "\r"` to activate a button), `Input.insertText`, `DOM.setFileInputFiles` and
`Page.captureScreenshot`. Traps:

- **A full-page capture does not paint `content-visibility: auto` sections off screen.** Doc
  blocks looked empty in every theme until scrolled into view.
- **`/kitchen-sink` is dev only;** the production build answers 404.
- **Production web listens on `PORT`, not `WEB_PORT`.** Run it as
  `PORT=13000 WEB_PROCESSES=1 pnpm --filter @loadbearing/web start` for the benchmarks.

## What is next

1. **Nothing that code alone can close.** Lite took messaging back the same day; anything
   built here in messaging or the shell now ports there as well.

The rest of `BACKLOG.md` waits on hardware, traffic or a trigger: `AX11.2` before 2027-03-31,
`S.2`, `S.3`, `24.7`, `26.8`.

**The machine was left running** (Linux, 2026-11-12): the containers with the `observability`,
`sharded` and `analytics` profiles. No app process: start them with `pnpm dev`. The test data is alice
(platform admin), bob (owner of "Bob"), carol (member of "Bob"), one direct conversation and one group, the
spaces `bench` (2,000 pages, from `doc:bench`), `walk` (Forest, one page) and `partners` (granted,
no grants), and three assistant threads.

## Open decisions for the owner

None open. `WK.7` and `26.4` were decided on 2026-11-12 and are recorded in `archive/DONE.md`.

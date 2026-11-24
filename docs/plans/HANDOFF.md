---
title: Handoff — how to pick the work up on any machine
updated: 2026-11-21
owner: sami
---

# Handoff

What lives nowhere else: machine setup, test accounts, how work is checked, and the traps that cost
time. Open work is in [`BACKLOG.md`](BACKLOG.md) — all of it waits on hardware, traffic or a trigger.
Last verified 2026-11-12: `check architecture` 32/32, `pnpm test` 2,639 tests, `pnpm smoke` 56.

## Setting up a new machine

Node ≥ 24, pnpm 11 (`packageManager` in the root `package.json`), Docker Desktop.

```bash
git clone https://github.com/prodicle/loadbearing_tanstack_start_kit.git && cd loadbearing_tanstack_start_kit
git checkout dev && git pull
pnpm install
cp .env.example .env            # first time only; then diff them, below
pnpm infra up                    # postgres, pgbouncer, 2× redis, minio, mailpit, loki
pnpm db migrate                  # every node; creates every tenant's partitions
pnpm seed:dev                     # grants platform keys (incl. platform.account.*) to platform_admin
pnpm build:packages && pnpm --filter @loadbearing/web build   # before typecheck: the route tree is generated
pnpm check architecture          # expect 32/32 with no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm dev                         # web on http://localhost:13000, Mailpit on :18025
```

- **A `.env` naming more nodes needs every matching profile.** With `DATABASE_SHARD_1_*`,
  `DATABASE_REPLICA_URL`, `CLICKHOUSE_URL` and a cold tier set, plain `pnpm infra up` makes
  `pnpm db migrate` fail dialling 15433 and smoke fail `fetch failed`. Use
  `pnpm infra up sharded replica analytics cold-tier`, then `pnpm ops ch-migrate`.
- **`.env` drifts behind `.env.example` unnoticed:**
  `comm -23 <(grep -oE "^[A-Z_]+=" .env.example | sort -u) <(grep -oE "^[A-Z_]+=" .env | sort -u)`.
- **Ports:** web 13000, Postgres 16432, pgBouncer 16433, Mailpit 18025, MinIO 19000.

### Test accounts

A fresh database has none; `pnpm seed:dev` creates organizations and roles, users come from sign-up.

1. Sign up `alice@example.test`, `bob@example.test`, `carol@example.test`, password `Correct-Horse-9`.
2. Verify each in Mailpit — its text part ends lines in `\r`; strip it before `curl`-ing a link.
3. `pnpm ops platform-grant alice@example.test` makes alice platform admin.
4. Sign each in. Under `AUTH_ENROLMENT_MODE=personal` the first sign-in founds their own org (not
   alice's — the grant already gave her a membership).
5. For a member: bob invites carol (`member/invite`); carol, already in an org, accepts via
   `POST /api/auth/invitation/accept` with the mailed token.

`widget.dismissal` is off everywhere with no targets. Walks must put back everything they change.

## How work is checked

Each phase: **gates** (build, web build, typecheck, lint, `check architecture`, `check contrast`,
`pnpm test`), then a **scripted walk** against `pnpm dev` with `curl` cookie jars, then **cleanup**.

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

- **Server-rendered HTML** (`curl -b alice.jar $BASE/dashboard`) shows zone cards
  (`class="ui-zone__title"`) and the session payload.
- **For "no request was made", use a browser network panel**, signing in via
  `fetch('/api/auth/sign-in/email', …)` from the page rather than the form.

### Browser walks without the extension

Drive Playwright's cached Chromium (`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
--headless=new --remote-debugging-port=9333`) over the DevTools protocol with Node's built-in
`WebSocket`: `Network.setCookie` to copy a jar in, `Network.requestWillBeSent` to record requests,
`Runtime.evaluate` with `replMode: true` for top-level `await`, `Input.dispatchKeyEvent` (Enter needs
`text: "\r"` to activate a button), `Input.insertText`, `DOM.setFileInputFiles`,
`Page.captureScreenshot`.

- A full-page capture does not paint off-screen `content-visibility: auto` sections — doc blocks look
  empty until scrolled into view.
- `/kitchen-sink` is dev only; production answers 404.
- Production web listens on `PORT`, not `WEB_PORT`:
  `PORT=13000 WEB_PROCESSES=1 pnpm --filter @loadbearing/web start` for benchmarks.

## Rules and traps that cost time

- **No attribution, ever** — no `Co-Authored-By:`, "generated with" or tool name in any commit, PR or
  branch; this overrides harness defaults (`docs/ai/rules/workflow.md`).
- **Commits:** conventional, scope from `commitlint.config.js`, subject not capitalised
  ("`PgAccountRepository` …" is rejected), header ≤ 100 characters, one commit per layer. **A rejected
  commit leaves its files staged for the next one** — check `git diff --cached --quiet` first.
- **The pre-push hook runs lint, `check architecture` and `check contrast`.** §8 fails "`.output` is
  older than `src`" after any change under `apps/web/src` (even a `biome check --write` re-sort) —
  rebuild web right before pushing.
- **Comments: `//`, two lines max (§14)** — a line above an existing two-line comment fails; rewrite.
- **`pnpm test` stops at the first failing package**; run the rest with `pnpm --filter`.
- **Database specs need Docker healthy.** After host sleep Docker Desktop is often stopped, and its VM
  clock runs about a second behind — never compare host time with Postgres `now()` within a second
  (`AX6.10`).
- **drizzle-kit renames cannot run unattended:** `drizzle-kit generate --custom --name <name>`,
  hand-write the SQL, rename the column in that migration's `meta/*_snapshot.json`, then confirm plain
  `generate` reports "No schema changes".
- **New tables:** `pnpm exec drizzle-kit generate --name <name> && pnpm exec tsx partition-ddl.ts` (in
  `packages/infrastructure`) writes `PARTITION BY` for `PartitionedTable` entries.
- **Data-only migrations** (key grants) are custom; `0045` and `0048` show the shape — select roles by
  a key they hold.
- **`permission_overrides` is a catalog table**, like all RBAC; no account or override change needs
  placing on a tenant node (`AX6.13`).
- **Branded ids and ESLint:** `feature` cannot resolve `zod`, so a branded id from a query is an
  "error type" to ESLint while `tsc` passes — annotate with the contract DTO, as `MemberList` and
  `AccountPanel` do.
- **`feature` must not name `@tanstack/react-query`** — take client types from `QueryRuntime` in
  `@loadbearing/query`.
- **A heredoc or `node -e` with an apostrophe breaks quoting** — write the script to a file.
- **Git Bash has no time-zone database:**
  `node -e 'console.log(new Date().toLocaleTimeString("en-GB",{timeZone:"Asia/Dhaka"}))'`.
- **`pnpm dev` can die mid-session** (SIGTERM with no logged cause, and `--parallel` takes worker and
  realtime with it) — restart and redo the step that came back empty.
- **Stopping `pnpm dev` leaves node processes listening** — kill by repo path and by ports 13000–13009
  (vite has no repo path in its command line). PowerShell:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` plus `Get-NetTCPConnection -LocalPort 13000`.
- **Lint stack:** Biome formats and owns whole-module import bans; ESLint owns named-export and
  type-import nuance. Biome `overrides` replace rule options rather than merge, and its
  `noRestrictedImports` flags `import type` too.

# loadbearing

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis (cache + queue) · S3 · stdout to Loki · ClickHouse behind a driver flag

## Running it locally

Node ≥ 24, pnpm ≥ 11.21, Docker running.

**1 · Install and configure.** Copy the template whole — every required key has a working local
value in it, and `apps/web/src/env.ts` parses the entire schema at module load, so a missing one is
a boot failure rather than a 500 an hour later.

    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"

**2 · Host ports, if any are taken.** Compose reads its overrides from `infra/.env` — not the root
`.env`; with `-f infra/docker-compose.yml`, `infra/` is the project directory. Add the override
there and change the matching URL in the root `.env`:

    # infra/.env                    # .env
    POSTGRES_PORT=15432             DATABASE_URL=postgres://ratchet:ratchet@localhost:15432/ratchet
    REDIS_CACHE_PORT=16379          REDIS_CACHE_URL=redis://localhost:16379
    REDIS_QUEUE_PORT=16380          REDIS_QUEUE_URL=redis://localhost:16380

`POSTGRES_PORT` `REDIS_CACHE_PORT` `REDIS_QUEUE_PORT` `S3_PORT` `MINIO_CONSOLE_PORT` `SMTP_PORT`
`MAILPIT_UI_PORT` `LOKI_PORT` `ALLOY_PORT` are all overridable. For the web app itself, change
`--port` in `apps/web/package.json` and keep `AUTH_URL` and `AUTH_TRUSTED_ORIGINS` in step — Better
Auth signs cookies against the first and the CORS layer reads the second.

**3 · Infrastructure.** Postgres + pgvector, two Redis instances (cache and queue, deliberately
separate), MinIO, Mailpit, and the Loki/Alloy log pipeline. ClickHouse sits behind
`pnpm infra:up:analytics` and is not started by default. See
[docs/setup/11](docs/setup/11-local-infrastructure.md).

    pnpm infra:up
    docker compose -f infra/docker-compose.yml --profile "*" ps   # all healthy before continuing

**4 · Database.**

    pnpm db:migrate        # drizzle migrations — including Better Auth's own tables
    pnpm db:seed           # the `loadbearing` organization + the four system roles

`db:seed` prints `seed complete: <organizationId>`. It creates no user — the first person to sign up
is enrolled into that organization. (`pnpm auth:tables` creates nothing: it prints what Better
Auth's tables must look like in the pinned runtime, to diff against `auth.schema.ts` after an
upgrade.)

**5 · Run.** `pnpm dev` builds the packages first, then runs web and worker in parallel; both load
the root `.env` themselves.

    pnpm dev               # or: pnpm dev:web

| | |
|---|---|
| Web app | http://localhost:3000 |
| Mailpit — catches every outgoing mail | http://localhost:8025 |
| MinIO console | http://localhost:9001 |
| Loki API | http://localhost:3100 |
| Readiness probe | http://localhost:3000/api/health |
| Drizzle Studio | `pnpm db:studio` |

**6 · First sign-in.** Sign up at `/sign-in`. `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to on, so
the verification mail lands in Mailpit — open it and click through. `BOOTSTRAP_ORGANIZATION_SLUG`
enrols you into the seeded organization, and the **first** user through the door gets `owner`
(everyone after gets `member`). `owner` holds `rbac.role.read`, so `/settings/roles` renders; a
`member` account is redirected to `/forbidden`, which is the fastest way to watch both guards work.

**Before committing.**

    pnpm check:architecture   # needs pnpm build:packages + a web build, or two assertions skip
    pnpm typecheck && pnpm lint && pnpm test

### When it does not come up

| Symptom | Cause |
|---|---|
| 500 on first request, a `ZodError` naming env keys | `.env` missing or incomplete — redo step 1 |
| `/api/health` returns 503 | a container is not up, or a URL in `.env` names the wrong host port |
| `ECONNREFUSED` from `db:migrate` | Postgres not healthy yet, or something else holds 5432 |
| Signed up, but the shell still renders signed-out | no membership: `BOOTSTRAP_ORGANIZATION_SLUG` unset, or `db:seed` never ran |

**Two stores are wired but off.** ClickHouse (`AnalyticsReader`, `AnalyticsProjector`) and Loki's read
side (`LogReader`) have working adapters, a projection consumer, and a nightly reconciliation — and
the container builds none of them unless `CLICKHOUSE_URL` / `LOKI_URL` are set. *The seam being
implemented* and *the store being started* are separate decisions, and only the second costs anything
to be wrong about. See
[reference/clickhouse](packages/infrastructure/docs/reference/clickhouse.md).

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — what a coding agent reads first. A router and nothing else: one
  row per task, pointing at the file that answers it. `CLAUDE.md` imports it.
- **[`docs/ai/`](docs/ai/index.md)** — everything written for agents rather than for people.
  [`rules/`](docs/ai/rules/index.md) is the rulebook, one file per topic and none over ~650 tokens;
  [`skills/`](docs/ai/skills/add-slice.md) holds the run books, reached through `.claude/skills/`
  and `.agents/`.
- **[`docs/setup/`](docs/setup/00-README.md)** — the build order, walked once. Thirty-one documents
  from an empty directory to a running app: `01`–`27` build the kit (`09b` included), `28` and `29`
  are reference, and `30` adds the desktop shell.
- **[`docs/opinions/`](docs/opinions/index.md)** — the reference, consulted continually. Every rule
  for what to call a thing, where to put it, and which store owns it.
- **`packages/*/docs/`** — one reference set per package: what it is for, and why each export is
  shaped the way it is.
- **[`docs/infra/`](docs/infra/index.md)** — the running stack: what each container is for, how the
  log pipeline works, and what to check when it is wrong.

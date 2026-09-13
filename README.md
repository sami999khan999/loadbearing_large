# loadbearing

pnpm workspaces · TanStack Start + oRPC · standalone worker · Postgres + pgvector · Redis (cache + queue) · S3 · stdout to Loki · ClickHouse behind a driver flag

## Running it locally

Node ≥ 24, pnpm ≥ 11.21, Docker running.

**1 · Install and configure.** Copy the template whole — every required key has a working local
value in it, and `apps/web/src/env.ts` parses the entire schema at module load, so a missing one is
a boot failure rather than a 500 an hour later.

    pnpm install
    node -e "require('fs').copyFileSync('.env.example', '.env')"

**2 · Host ports, if any are taken.** Every published port has a default in the compose file, so
`infra/.env` does not exist until you need one — create it, and note that compose reads it rather
than the root `.env`: with `-f infra/docker-compose.yml`, `infra/` is the project directory. Add the
override there and change the matching URL in the root `.env`:

    # infra/.env                    # .env
    POSTGRES_PORT=15432             DATABASE_URL=postgres://ratchet:ratchet@localhost:15432/ratchet
    REDIS_CACHE_PORT=16379          REDIS_CACHE_URL=redis://localhost:16379
    REDIS_QUEUE_PORT=16380          REDIS_QUEUE_URL=redis://localhost:16380

`POSTGRES_PORT` `REDIS_CACHE_PORT` `REDIS_QUEUE_PORT` `S3_PORT` `MINIO_CONSOLE_PORT` `SMTP_PORT`
`MAILPIT_UI_PORT` `LOKI_PORT` `ALLOY_PORT` `CLICKHOUSE_HTTP_PORT` `CLICKHOUSE_NATIVE_PORT` are all
overridable. For the web app itself, change
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

**6 · First sign-in.** Sign up at `/sign-up`. `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to on, so
the verification mail lands in Mailpit — open it and click through.

> Every message in this system is a job on `QueueName.MAIL`, rendered and sent by the worker, so
> **nothing reaches Mailpit unless the worker is running**. `pnpm dev` starts both. What that buys
> is one send path with retries, backoff and a rate limiter behind it — the argument is in
> [`packages/composition/docs/reference/mail-pipeline.md`](packages/composition/docs/reference/mail-pipeline.md).

**No session is ever issued without a membership**, so how you acquire one is a decision the
template makes for you: `AUTH_ENROLMENT_MODE=personal` ships as the default, which makes you the
`owner` of an organization of your own with the same four system roles `pnpm db:seed` creates. It is
the only mode that works against an empty database. The other two are `bootstrap` (everyone joins
the one organization `BOOTSTRAP_ORGANIZATION_SLUG` names, first in as `owner`) and `invite` (an
invitation is the only door — the production posture). Whichever mode is set, an address with a
pending invitation joins the organization that invited it instead.

`owner` holds `rbac.role.read`, so `/settings/roles` renders. Invite a second address from
`/settings/members`, accept it in another browser profile, and that `member` account is redirected
to `/forbidden` — the fastest way to watch both the route guard and the use-case gate work on the
same decision.

**Before committing.**

    pnpm check:architecture   # needs pnpm build:packages + a web build, or two assertions skip
    pnpm typecheck && pnpm lint && pnpm test

### When it does not come up

| Symptom | Cause |
|---|---|
| 500 on first request, a `ZodError` naming env keys | `.env` missing or incomplete — redo step 1 |
| `/api/health` returns 503 | a container is not up, or a URL in `.env` names the wrong host port |
| `ECONNREFUSED` from `db:migrate` | Postgres not healthy yet, or something else holds 5432 |
| Signed up, but the shell still renders signed-out | no membership: under `bootstrap`, `BOOTSTRAP_ORGANIZATION_SLUG` is unset or `db:seed` never ran; under `invite`, there is no invitation for the address |

**Two stores are wired but off.** ClickHouse (`AnalyticsReader`, `AnalyticsProjector`) and Loki's read
side (`LogReader`) have working adapters, a projection consumer, and a nightly reconciliation — and
the container builds none of them unless `CLICKHOUSE_URL` / `LOKI_URL` are set. *The seam being
implemented* and *the store being started* are separate decisions, and only the second costs anything
to be wrong about. See
[reference/clickhouse](packages/infrastructure/docs/reference/clickhouse.md).

## Documentation

- **[`AGENTS.md`](AGENTS.md)** — what a coding agent reads first, and the only file most tools load
  unprompted. A brief and nothing else: four rules that cost the most when broken, then a pointer
  to the task router. `CLAUDE.md` `@`-imports it rather than restating it.
- **[`docs/ai/`](docs/ai/index.md)** — everything written for agents rather than for people. This
  page is the task router, one row per thing you might be about to do.
  [`rules/`](docs/ai/rules/index.md) is the rulebook, one file per topic and none over ~900 tokens;
  [`skills/`](docs/ai/skills/add-slice.md) holds the run books, surfaced in Claude Code through
  `.claude/skills/`.
- **[`docs/setup/`](docs/setup/00-README.md)** — the build order, walked once. Thirty-one documents
  from an empty directory to a running app: `01`–`27` build the kit (`09b` included), `28` and `29`
  are reference, and `30` adds the desktop shell.
- **[`docs/opinions/`](docs/opinions/index.md)** — the reference, consulted continually. Every rule
  for what to call a thing, where to put it, and which store owns it.
- **`packages/*/docs/`** — one reference set per package: what it is for, and why each export is
  shaped the way it is.
- **[`docs/infra/`](docs/infra/index.md)** — the running stack: what each container is for, how the
  log pipeline works, and what to check when it is wrong.

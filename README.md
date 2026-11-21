<div align="center">

# loadbearing

**A full-scale TypeScript starter kit, with every store running and every seam built.**

TanStack Start + oRPC · standalone worker · realtime stream process · Postgres + pgvector ·<br>
two Redis instances · S3 · stdout → Loki · ClickHouse behind a driver flag

<br>

![Node](https://img.shields.io/badge/node-%E2%89%A5%2024-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A5%2011.21-F69220?style=flat-square&logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154?style=flat-square&logo=reactquery&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Postgres-pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-cache%20%2B%20queue-FF4438?style=flat-square&logo=redis&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

**[Quick start](#-quick-start)** ·
**[Architecture](#-architecture)** ·
**[Big kit vs lite](#-big-kit-vs-lite)** ·
**[Documentation](#-documentation)**

</div>

<br>

> [!NOTE]
> This is the **big kit**. Its smaller sibling,
> **[loadbearing lite](https://github.com/sami999khan999/loadbearing_mini)**, is the same code with
> the scale stores removed and every seam kept, for projects that do not need them yet.

<br>

## ✦ Highlights

<table>
<tr>
<td width="50%" valign="top">

**🧱 Layered, port-and-adapter packages**<br>
Sixteen `@loadbearing/*` packages whose dependencies point one way. The domain names no
framework and never logs, and CI fails the build if it starts to.

</td>
<td width="50%" valign="top">

**🗄️ Built to shard from day one**<br>
Every tenant table is partitioned by `organization_id`. Every repository declares where its
tables live. Every connection is written for pgBouncer in transaction mode.

</td>
</tr>
<tr>
<td valign="top">

**🔐 Auth, RBAC and entitlements**<br>
Better Auth sessions, organizations with four system roles, per-plan entitlements and feature
flags. All of them are enforced on the server.

</td>
<td valign="top">

**📬 One send path for every message**<br>
Mail is a BullMQ job, rendered and sent by the worker with retries, backoff and a rate
limiter. It is never sent from inside a request.

</td>
</tr>
<tr>
<td valign="top">

**🎨 Six themes, twelve colours**<br>
Every colour is one of twelve tokens. `pnpm check:contrast` checks 154 pairings against WCAG AA
in every theme and mode.

</td>
<td valign="top">

**🛡️ 32 architecture assertions**<br>
`pnpm check:architecture` catches what typecheck, lint and tests miss: framework leaks,
missing tenant scope, stale doc paths, port drift and more.

</td>
</tr>
</table>

<br>

## ✦ Stack

| Layer | Choice |
|---|---|
| **Web** | TanStack Start · React 19 · Tailwind 4 · oRPC |
| **Processes** | `apps/web` · `apps/worker` · `apps/realtime` |
| **Database** | Postgres + pgvector · Drizzle ORM · pgBouncer · read replica |
| **Cache & queue** | Two Redis instances, deliberately separate · BullMQ |
| **Storage** | S3 (MinIO locally), with a `cold/` tier for archived partitions |
| **Logs** | JSON to stdout → Alloy → Loki |
| **Analytics** | ClickHouse, behind `CLICKHOUSE_URL` and off by default |
| **Mail** | SMTP, caught by Mailpit in development |
| **Copy** | `@loadbearing/content`, in English and Bangla |

<br>

## ✦ Architecture

A package may import from anything to its left, never from anything to its right.

```mermaid
flowchart LR
  errors --> core --> permissions & observability --> contracts --> asset & content
  asset & content --> application --> infrastructure --> auth --> composition --> api-server
  api-server --> ui --> api-client --> query --> feature --> apps["apps/{web,worker,realtime}"]
```

- **`packages/application`** is the domain. It names no framework and never logs.
- **`packages/infrastructure`** is organized by vendor (`pg/`, `redis/`, `s3/`, `clickhouse/` …), so swapping a vendor means deleting one folder.
- **`packages/composition`** is the DI root, and the only place a concrete adapter is named.
- **`apps/*`** are thin, framework-shaped and deletable. Business logic never lands there.

The full rules are in [`docs/ai/rules/layering.md`](docs/ai/rules/layering.md).

<br>

## ✦ Quick start

> **Requirements:** Node ≥ 24, pnpm ≥ 11.21, and Docker running.

```bash
pnpm install
node -e "require('fs').copyFileSync('.env.example', '.env')"   # then set AUTH_SECRET
pnpm infra:up                                                  # the whole local stack
pnpm db:migrate && pnpm db:seed
pnpm dev                                                       # web + worker + realtime
```

Then open **http://localhost:13000/sign-up**. The verification mail lands in Mailpit at
**http://localhost:18025**.

<details>
<summary><b>Step by step, with the reasons</b></summary>

<br>

**1 · Install and configure.** Copy the template whole. Every required key has a working local
value in it, and `apps/web/src/env.ts` parses the entire schema at module load, so a missing key is
a boot failure rather than a 500 an hour later.

Then set a real `AUTH_SECRET` in `.env` (`openssl rand -base64 32`). The template's `change-me` is
too short for the schema on purpose, so a placeholder can never boot and reach production.

**2 · Host ports, if any are taken.** Every published port is the well-known one with a `1` in
front, so this stack does not fight another one on your machine. Inside the compose network nothing
moved: `postgres:5432` is still `postgres:5432`.

There is **one env file**, the `.env` at the root, and both halves of a port live in it. Change the
`*_PORT` that compose publishes and the URL that dials it together:

```bash
POSTGRES_PORT=15432
DATABASE_URL=postgres://ratchet:ratchet@localhost:15432/ratchet
```

`POSTGRES_PORT` `PGBOUNCER_PORT` `REDIS_CACHE_PORT` `REDIS_QUEUE_PORT` `S3_PORT`
`MINIO_CONSOLE_PORT` `SMTP_PORT` `MAILPIT_UI_PORT` `LOKI_PORT` `ALLOY_PORT` `CLICKHOUSE_HTTP_PORT`
`CLICKHOUSE_NATIVE_PORT` and `WEB_PORT` are the full set, and each one is documented in
`.env.example`. `check:architecture` §27 fails the build if a `*_PORT` and the URL beside it
disagree. Without it, that mistake shows up as a connection refused that names nothing.

For the web app, change `WEB_PORT`. `apps/web/vite.config.ts` reads it, and `APP_BASE_URL`,
`AUTH_URL` and `AUTH_TRUSTED_ORIGINS` must all name it. Better Auth signs cookies against `AUTH_URL`,
and the CORS layer reads `AUTH_TRUSTED_ORIGINS`. §27 checks all three.

**3 · Infrastructure.** Postgres + pgvector, two Redis instances (cache and queue), MinIO, Mailpit,
and the Loki/Alloy log pipeline. ClickHouse is not started by default; `pnpm infra:up:analytics`
adds it. See [docs/setup/11](docs/setup/11-local-infrastructure.md).

```bash
pnpm infra:up
docker compose -f infra/docker-compose.yml --profile "*" ps   # wait until all are healthy
```

**4 · Database.**

```bash
pnpm db:migrate        # drizzle migrations, including Better Auth's own tables
pnpm db:seed           # the `loadbearing` organization + the four system roles
```

`db:seed` prints `seed complete: <organizationId>`. It creates no user: the first person to sign up
is enrolled into that organization. `pnpm auth:tables` creates nothing either. It prints what
Better Auth's tables must look like in the pinned runtime, to diff against `auth.schema.ts` after
an upgrade.

**5 · Run.** `pnpm dev` builds the packages first, then runs web, worker and realtime in parallel.
Each one loads the root `.env` itself. `pnpm dev:web` runs the web app alone.

**6 · First sign-in.** Sign up at `/sign-up`. `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to on, so
the verification mail lands in Mailpit. Open it and click through.

</details>

<br>

### Local URLs

| Service | Address |
|---|---|
| 🌐 Web app | http://localhost:13000 |
| 📬 Mailpit, which catches every outgoing mail | http://localhost:18025 |
| 🪣 MinIO console | http://localhost:19001 |
| 📜 Loki API | http://localhost:13100 |
| 💓 Readiness probe | http://localhost:13000/api/health |
| 🗃️ Drizzle Studio | `pnpm db:studio` |

> [!IMPORTANT]
> Every message in this system is a job on `QueueName.MAIL`, rendered and sent by the worker, so
> **nothing reaches Mailpit unless the worker is running**. `pnpm dev` starts it. The reasoning is
> in [`mail-pipeline.md`](packages/composition/docs/reference/mail-pipeline.md).

<br>

## ✦ Accounts and organizations

**No session is ever issued without a membership**, so `AUTH_ENROLMENT_MODE` decides how you get
one:

| Mode | What happens on sign-up |
|---|---|
| `personal` *(default)* | You become `owner` of a new organization of your own, with the four system roles. It is the only mode that works against an empty database. |
| `bootstrap` | Everyone joins the one organization `BOOTSTRAP_ORGANIZATION_SLUG` names. The first person in becomes `owner`. |
| `invite` | An invitation is the only way in. This is the production posture. |

In every mode, an address with a pending invitation joins the organization that invited it instead.

**Try the permission gates.** `owner` holds `rbac.role.read`, so `/settings/roles` renders. Invite
a second address from `/settings/members` and accept it in another browser profile. That `member`
account is redirected to `/forbidden`, which shows the route guard and the use-case gate making the
same decision.

<br>

## ✦ Before committing

```bash
pnpm check:architecture   # needs pnpm build:packages + a web build, or two assertions skip
pnpm typecheck && pnpm lint && pnpm test
```

<details>
<summary><b>When it does not come up</b></summary>

<br>

| Symptom | Cause |
|---|---|
| 500 on the first request, with a `ZodError` naming env keys | `.env` is missing or incomplete. Redo step 1. |
| `/api/health` returns 503 | A container is not up, or a URL in `.env` names the wrong host port. |
| `ECONNREFUSED` from `db:migrate` | Postgres is not healthy yet, or something else holds the port. |
| Signed up, but the shell still renders signed-out | No membership. Under `bootstrap`, `BOOTSTRAP_ORGANIZATION_SLUG` is unset or `db:seed` never ran. Under `invite`, there is no invitation for the address. |

</details>

<br>

## ✦ Big kit vs lite

Both kits share the same packages, the same `@loadbearing/*` scope and the same rules. The
difference is which stores are running.

| | **loadbearing** *(this repo)* | **[loadbearing lite](https://github.com/sami999khan999/loadbearing_mini)** |
|---|---|---|
| Postgres | pgBouncer · read replica · shard nodes | one node, dialled directly |
| Redis | two instances, cache and queue | one instance, `noeviction` |
| Logs | stdout → Alloy → Loki | stdout |
| Analytics | ClickHouse, behind a flag | not built |
| Retention | archive-then-drop to S3 `cold/` | partitions kept, never dropped |
| Widgets and zones | ✅ | not built |
| Seams | ✅ all built | ✅ all built |
| Host ports | `1xxxx` | `2xxxx` |

**Two stores are wired but off.** ClickHouse (`AnalyticsReader`, `AnalyticsProjector`) and Loki's
read side (`LogReader`) have working adapters, a projection consumer and a nightly reconciliation.
The container builds none of them unless `CLICKHOUSE_URL` or `LOKI_URL` is set. *Building the seam*
and *starting the store* are separate decisions, and only the second costs anything to get wrong.
See [reference/clickhouse](packages/infrastructure/docs/reference/clickhouse.md).

<br>

## ✦ Documentation

| Where | What it is |
|---|---|
| **[`AGENTS.md`](AGENTS.md)** | What a coding agent reads first: the four rules that cost the most when broken, then a pointer to the task router. `CLAUDE.md` imports it. |
| **[`docs/ai/`](docs/ai/index.md)** | Everything written for agents. The index is a task router; [`rules/`](docs/ai/rules/index.md) is the rulebook (fourteen files, ~11,900 tokens), and [`skills/`](docs/ai/skills/add-slice.md) holds the run books. |
| **[`docs/setup/`](docs/setup/00-README.md)** | The build order, walked once. Thirty-one documents from an empty directory to a running app. |
| **[`docs/opinions/`](docs/opinions/index.md)** | The reference: what to call a thing, where to put it, and which store owns it. |
| **`packages/*/docs/`** | One reference set per package: what it is for, and why each export is shaped the way it is. |
| **[`docs/infra/`](docs/infra/index.md)** | The running stack: what each container is for, how the log pipeline works, and what to check when it is wrong. |

<br>

<div align="center">
<sub>Built to carry weight. ⚙️</sub>
</div>

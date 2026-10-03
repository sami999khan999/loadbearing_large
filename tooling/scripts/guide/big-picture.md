## What it is

The kit is a ready-made base for a software product that many companies use at once. Each company
gets its own private space, called an **organization**. You, the super admin, look after all of
them together.

## The three programs

The kit runs as three separate programs. Each does one kind of work, so a slow job in one never
holds up the others.

| Program | What it does | Where it lives |
|---|---|---|
| **Web app** | Every page you see, and every button you press | `apps/web`, port 13000 on your machine |
| **Worker** | Work that happens in the background: email, nightly clean-ups, exports, deletes, archiving, moves | `apps/worker` |
| **Stream process** | Keeps a live line open to each browser tab, so the bell and messages update without a refresh | `apps/realtime`, port 13001 |

## The services

The programs keep their data in services. On your machine they all run in Docker, and
`pnpm infra:up` starts the everyday set:

| Service | What it holds |
|---|---|
| **Postgres** | Everything that matters: accounts, organizations, roles, docs, messages, the history of who did what |
| **pgBouncer** | Not a store. A gatekeeper in front of Postgres that lets many requests share a few connections |
| **Redis — cache** | A short-term memory that makes pages fast. It can be thrown away |
| **Redis — queue** | The list of background jobs. A separate server, saved to disk, because a lost job is work that never happens |
| **S3 storage** (MinIO on your machine) | Files: doc images, exports, and old months in cold storage |
| **Mailpit** | A fake inbox. On your machine no email ever leaves; it all lands here, at `localhost:18025` |
| **Loki** and **Alloy** | The logs: Alloy collects what each program prints, Loki keeps it for 30 days |

Some services are for a platform that has grown, and start only when asked:

| Command | Adds |
|---|---|
| `pnpm infra:up:analytics` | **ClickHouse**, the analytics store behind the **Activity** page |
| `pnpm infra:up:replica` | a **read replica**: a standby copy of the database |
| `pnpm infra:up:sharded` | a second database **node**, so organizations can be spread out |
| `pnpm infra:up:cold-tier` | a second storage server for the coldest files |

> [!TIP]
> **If Redis lost its cache**, it would simply be rebuilt from Postgres. That is why Postgres is
> the one store that must never lose data. The queue is kept on a server of its own for the same
> reason: it is the one part of Redis that matters.

## How a click travels

:::steps
### You press a button

The web page sends a request to the web app.

### The web app checks who you are

It reads your session and works out what you are allowed to do. If you are not allowed, it stops
here and says so.

### The work is done

The web app finds which database node holds your organization and reads or writes there. If the
work is slow, such as sending an email or exporting a tenant, it puts a job on the queue instead
and answers straight away.

### The worker picks up the job

Seconds later the worker runs it, and the stream process tells your browser when something changes.
:::

## Good to know

:::accordion{title="Is there a smaller version?"}
Yes: the **lite** kit. It is this kit with the stores a smaller product does not need taken out:
no ClickHouse, no Loki, one Redis and one database node. It keeps every seam, so a lite project
can grow back into this one.
:::

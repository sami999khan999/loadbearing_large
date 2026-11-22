---
title: pgbouncer
description: Transaction-mode pooling — the startup-parameter trap, the role floor that closes it, and the two verbs that are not interchangeable.
---

# `pgbouncer`

One process in front of Postgres pooling in **transaction mode**: a server connection is held for one
transaction and returned on commit, so many app connections share few Postgres ones — why
[`postgres`](postgres.md) runs `max_connections=200` with `DEFAULT_POOL_SIZE` 20. `DATABASE_URL`
points here; `DATABASE_DIRECT_URL` points past it at `:5432`, for migrations, the seed, `drizzle-kit`
and the activity archive.

## The container listens on 5432, not 6432

`edoburu/pgbouncer` sets `listen_port = 5432`, so compose maps `${PGBOUNCER_PORT:-6432}:5432` and
healthchecks `pg_isready -h localhost -p 5432`. `6432:6432` gives a port nothing answers and a
forever-unhealthy check — a pooler nobody is talking to, looking like one that will not start.

## The startup-parameter trap

`pg` sends `statement_timeout` as a **startup parameter**, which a transaction pooler cannot forward
(the server connection belongs to whoever holds it next). pgBouncer's `IGNORE_STARTUP_PARAMETERS`:

- **Without `statement_timeout` listed, nothing connects** — the socket closes before auth with
  `unsupported startup parameter: statement_timeout`, surfacing in drizzle as a bare `Failed query`.
- **With it listed, the parameter is gone** — `SHOW statement_timeout` through the pooler reads `0`,
  unlimited on every app connection.

So the ignore list turns a refused connection into an unlimited one. Migration `0022` makes that safe:

```sql
ALTER ROLE CURRENT_USER SET statement_timeout = '30s';
ALTER ROLE CURRENT_USER SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE CURRENT_USER SET lock_timeout = '10s';
```

A role default is read when a **server** connection starts — the one thing a pooled session inherits.
Longer work raises it per transaction with `SET LOCAL` inside
[`PgUnitOfWork.run`](../../../packages/infrastructure/docs/reference/unit-of-work.md).
`application_name` is tracked natively, reaching `pg_stat_activity` with no entry or role setting.

**`CURRENT_USER` is whoever ran the migration**, so `db:migrate` must run as the role the app connects
as; separate roles land the floor on the migrator and leave the app at `0`, silently.

## Never issue a session-level `SET`

In transaction mode `server_reset_query` (`DISCARD ALL`) never runs without
`server_reset_query_always = 1`, so a session `SET` survives and is inherited by every later client on
that server connection. Measured: one client setting `statement_timeout = '7s'`, then twenty-five fresh
clients all reading `7s`. **One `SET` poisons the pool.**

The repository is clean: no `SET`, `LISTEN`/`NOTIFY`, cursors, temporary tables, session advisory
locks or named prepared statements; its three advisory locks are `pg_advisory_xact_lock`. `SET LOCAL`
is always the answer. `SERVER_RESET_QUERY_ALWAYS` would cost a round trip per transaction; the rule is
cheaper, and `tests/smoke/pooled.smoke.spec.ts` notices if it breaks.

## `RECONNECT`, never restart

Role settings apply to new server connections; open ones keep old values until they close —
`server_idle_timeout` (600 s) idle, up to `server_lifetime` (3600 s, randomised) busy. After `0022`:

```
psql "postgres://ratchet:ratchet@localhost:16432/pgbouncer" -c "RECONNECT"
```

**Not a restart.** `RECONNECT` closes server connections and leaves clients alone. A restart drops
every client socket, which `pg` raises on idle clients as a pool `error` — turned by the worker into
`uncaughtException` and `exit(1)`. `Database` now listens (`database.pool.error`) so the process
survives, but the verbs are not interchangeable.

## Saturation is invisible from inside the application

`Container.health()` reports `pool: { total, idle, waiting, max }` from this process's `pg.Pool`,
which cannot see the pooler: with `DEFAULT_POOL_SIZE=2` and three concurrent transactions from one
`Pool({ max: 10 })`, the app reads `waiting: 0` while the pooler shows `cl_waiting=1`, and after
`query_wait_timeout` (120 s) the client gets an error it has no counter for.

`database.pool.saturated` fires on this side with a sampling window derived from
`DATABASE_POOL_CONNECT_TIMEOUT_MS` — `waiting` cannot outlive the connect timeout, so a ten-second
window against a five-second timeout would never fire. **A readiness probe competes with the traffic it
reports on:** `health()` reads `stats()` free, but `isHealthy()` runs `SELECT 1` through the pool, so
under saturation `/api/health` is slow for the same reason requests are — mind short liveness timeouts.

Ask the pooler (`ADMIN_USERS` enables this and `RECONNECT`):

```
psql "postgres://ratchet:ratchet@localhost:16432/pgbouncer" -c "SHOW POOLS"
```

`cl_active`, `cl_waiting`, `sv_active` and `maxwait` are the four that matter.

## What a transaction pooler does not break

Shorter than folklore; verified on the running stack and asserted by
`tests/smoke/pooled.smoke.spec.ts`:

| | |
|---|---|
| Savepoints — a nested `run()` | fine |
| `pg_advisory_xact_lock` | fine, serialises across connections |
| `FOR UPDATE SKIP LOCKED` — the outbox drain's one-statement claim | fine, claims stay disjoint |
| Better Auth's `drizzleAdapter` | fine — it opens no transaction of its own |
| `ALTER TABLE … DETACH PARTITION … CONCURRENTLY` | fine **as a single statement** |

The last fails inside any transaction, direct or pooled; the pooler is irrelevant.

## Sizing

`DEFAULT_POOL_SIZE` × databases × pgBouncer instances stays under `max_connections`, with headroom for
superusers and `RESERVE_POOL_SIZE`. The app's `DATABASE_POOL_MAX` now costs *client* slots
(`MAX_CLIENT_CONN`), not Postgres connections — the point of the pooler. A managed pooler replaces this
container with no code change: [Tier 0](../../opinions/dependencies.md).

---
title: Env
description: The second and last process.env reader — why its schema is smaller than the web app's, why the two are deliberately not shared, and what each concurrency value is protecting.
---

# `Env`

This app's only `process.env` reader.

## Deliberately not shared with the web app's schema

A shared schema would carry an unused `AUTH_SECRET` — **one more secret in one more environment.** The
worker builds a `Container` with no auth config and uses a `SystemPrincipal` from a named grant list.
`env.ts` skips `import.ts`: it is parsed before anything else exists.

## `WORKER_SHUTDOWN_TIMEOUT_MS`

The drain budget: **longer than your longest job, shorter than the orchestrator's SIGKILL timer**
([shutdown](./shutdown.md)).

## SMTP is required in both processes

The container requires mail (one that cannot send never completes a sign-up). The worker is the only
sender — `MailConsumer` renders every `QueueName.MAIL` job — and the web app parses the keys because it
builds the same `Container`. `APP_BASE_URL` is required for the links the worker renders; it is
deliberately *not* `AUTH_URL`, which only the web schema carries.

## The shard block, and the two rules that make it safe

`DATABASE_SHARD_<n>_URL` names every node after node 0, with an optional
`DATABASE_SHARD_<n>_DIRECT_URL` beside each. Absent is one node, which is every deployment until
the split — `DATABASE_URL` is node 0 and also the catalog.

**Two boot rules:** indexes are contiguous from 1 (a gap would misplace every tenant on later nodes), and
there is no `DATABASE_SHARD_0_URL` (a second name for the catalog pool). No range or key config —
`shard_assignments` names each tenant's node ([sharding](../../../../packages/infrastructure/docs/reference/sharding.md)).

## The swappable stores

A driver plus its connection detail; `Container` builds the class behind the port. `VECTOR_DRIVER` is
`pgvector`. `EMBEDDING_PROVIDER` is `none` (text search, no calls), `openai` or `gemini`. **A provider other than `none` makes `EMBEDDING_API_KEY` required,** and a set
`OPENAI_API_KEY`, the name before it, is refused. The schema refuses both at boot rather than failing
on the first document. See [embedding](../../../../packages/infrastructure/docs/reference/embedding.md).

`ASSISTANT_PROVIDER` likewise requires `ASSISTANT_API_KEY` unless `none` or `fake` —
[assistant](../../../../packages/infrastructure/docs/reference/assistant.md).

**The ClickHouse block is optional; its absence keeps ClickHouse off** — no projection lane. Present, the
projection and reconciliation run ([container](../../../../packages/composition/docs/reference/container.md)).
**`CLICKHOUSE_URL` makes `CLICKHOUSE_DATABASE` and `CLICKHOUSE_USER` required** — their `default` defaults
cannot reach compose's `ratchet` container.

## Logging

The web app's block. `LOG_PRETTY` must stay false wherever Alloy reads — its JSON stage drops a terminal
format.

## The seven concurrency knobs are not one knob

Each is per worker *instance* — four instances at 4 is sixteen in-flight jobs, each possibly holding a
Postgres connection.

- `WORKER_EMBEDDING_CONCURRENCY` (4) — bounded by the provider's rate limit and your pool.
- `WORKER_MAINTENANCE_CONCURRENCY` (1) — serial: table-level locks; two overlapping can deadlock on one partition.
- `WORKER_ANALYTICS_CONCURRENCY` (1) — **capped at 1 by the schema**: two runs read one checkpoint and project a batch twice; correctness rests on one writer.
- `WORKER_MAIL_CONCURRENCY` (4) — with `WORKER_MAIL_RATE_PER_MINUTE` (600), a BullMQ `limiter` on the queue.
- `WORKER_EVENT_CONCURRENCY` (8) — deliveries fan out one job per subscriber; the drain runs at `priority: 1` ahead of them.
- `WORKER_NOTIFICATION_CONCURRENCY` (2) — the digest fan-out waits on the mail queue's own limiter.
- `WORKER_ASSISTANT_CONCURRENCY` (32) — answers mostly wait on the provider; the lane exists only with an `ASSISTANT_PROVIDER`.

## `WORKER_QUEUES` and `WORKER_PROCESS_MAX_CONCURRENCY`

`WORKER_QUEUES` lists the queues served (unset: all). `WORKER_PROCESS_MAX_CONCURRENCY` (64) caps the
selected lanes' sum and refuses a boot over it ([supervisor](./supervisor.md)).

## Count your processes, and your concurrencies

The knobs draw on one pool. `WorkerBootstrap` sums the lanes that actually **started** (`WORKER_QUEUES`
may select fewer; analytics starts only with ClickHouse), leaving out mail — a send holds an SMTP socket, not a
connection — and emits `worker.pool.oversubscribed` above `DATABASE_POOL_MAX` (20). With no assistant
or analytics lane the defaults sum to 15, so it stays quiet; the assistant lane's 32 alone trips it. A warning, not
an error, since many jobs hold no connection — but `WORKER_EVENT_CONCURRENCY` counts fully:
`PgOutboxGateway.drain` relays **inside** `unitOfWork.run`, pinning a connection and a pgBouncer slot across its
Redis round trips.

`DATABASE_STATEMENT_TIMEOUT_MS` defaults to 120 s here against the web app's 30 s, and that is the
one field the two schemas deliberately disagree about. Through pgBouncer it reaches the server as a
`SET LOCAL` inside `PgUnitOfWork.run`, never as a startup parameter — see
[`docs/infra/reference/pgbouncer.md`](../../../../docs/infra/reference/pgbouncer.md).

## The two realtime numbers

`REALTIME_MAX_STREAMS_PER_USER` (8) and `REALTIME_STREAM_MAX_AGE_SECONDS` (1800) are enforced where
streams are served ([realtime env](../../../realtime/docs/reference/env.md)). The age limit releases unread channels; the client reconnects and is replayed.

The worker parses both and uses neither — its container's realtime subscriber never connects, so
`health().realtime` is honestly `null`.

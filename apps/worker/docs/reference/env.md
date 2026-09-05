---
title: Env
description: The second and last process.env reader — why its schema is smaller than the web app's, why the two are deliberately not shared, and what each concurrency value is protecting.
---

# `Env`

The second and last `process.env` reader in the repository; the other is `apps/web/src/env.ts`.
Everything else receives configuration.

## Deliberately not shared with the web app's schema

A common schema would force this process to carry an `AUTH_SECRET` it never uses — **one more secret
in one more environment for no reason.** The worker builds a `Container` with no auth config at all
and resolves no credential; it constructs a `SystemPrincipal` from a named grant list instead.

`env.ts` is also the one file in this app that does not read `import.ts`: it carries the schema that
turns the environment into a `ContainerConfig`, and it is parsed before anything else in the process
exists.

## Concurrency: serial, and only one of the two is a dial

| Variable | Default | Why |
|---|---|---|
| `WORKER_MAINTENANCE_CONCURRENCY` | 1 | Maintenance jobs take table-level locks and run nightly. Two overlapping buys nothing and can deadlock on the same partition |
| `WORKER_PROJECTION_CONCURRENCY` | 1 | **Not a dial worth turning.** Two projection runs read the same checkpoint, project the same rows, and turn one batch into two — correctness rests on there being exactly one writer, not on the insert being idempotent |

## `WORKER_SHUTDOWN_TIMEOUT_MS`

How long `worker.close()` is given to drain in-flight jobs before the process exits anyway.

**Longer than your longest job, shorter than your orchestrator's SIGKILL timer.** A value above that
timer just means the platform kills you mid-drain. See [`shutdown.md`](./shutdown.md).

## SMTP is required in both processes

Both build a `Container`, and the container treats mail as required configuration rather than
optional: a container that cannot send is one whose sign-ups never complete. Same URL shape as the
web app's.

> [!NOTE]
> The worker requires `SMTP_URL` and `EMAIL_FROM` "for the scheduled digest", and nothing in this
> process sends one yet — `DigestComposer` is constructed only in its own spec. `P8.3` either ships
> the notification consumer or drops the two keys from this schema.

## The swappable stores

A driver plus the connection detail that driver needs. `Container` reads the driver and builds the
class behind the port, so adopting a store is these variables and nothing else.

The ClickHouse block is optional, and **its absence is what keeps ClickHouse stopped**. Present
without `ANALYTICS_DRIVER=clickhouse` is the supported half-way state: the projection runs and the
reconciliation reports, while reads still come from Postgres. See
[`composition/docs/reference/container.md`](../../../packages/composition/docs/reference/container.md).

## Logging

The same block the web app parses. A worker with no log output is a worker you cannot operate, and
`LOG_PRETTY` must stay false anywhere Alloy is reading — it is a terminal format, and Alloy's JSON
stage drops what it cannot parse.

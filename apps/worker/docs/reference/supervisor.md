---
title: The supervisor
description: Lanes, WORKER_QUEUES, and the two ceilings a worker process checks before it starts consuming — the static half of the worker control plan.
---

# The supervisor

**A worker process runs lanes, and `WORKER_QUEUES` picks which.** A lane is one queue served
inside one process: one BullMQ `Worker` with its own concurrency. Before this, every process ran
every consumer. Adding a copy to speed up embedding also added a copy of mail, outbox and the rest,
and each copy opened database connections.

| Piece | File | Job |
|---|---|---|
| `LaneRegistry` | `src/supervisor/lane-registry.ts` | Every queue this build can serve, in start order, with its starting concurrency and the variable that sets it |
| `QueueLimits` | `src/supervisor/queue-limits.ts` | The most one process may run of each queue, whatever the environment says |
| `WorkerSupervisor` | `src/supervisor/worker-supervisor.ts` | Checks the ceilings, starts the selected lanes, and closes them on drain |

## `WORKER_QUEUES`

A comma list of queue names. Unset or empty serves every queue, which is the behaviour before the
variable existed.

```bash
# One service for the light queues, one for embedding with three replicas.
WORKER_QUEUES=mail,event,notification,maintenance
WORKER_QUEUES=embedding
```

Copies of one service split a queue's jobs between them: BullMQ hands each job to one taker, and
the repeatable schedules already dedupe by job id.

**A wrong name is a boot error, not a warning.** A typo here is a queue nobody drains, and it
looks exactly like a quiet queue. `analytics` is refused without `CLICKHOUSE_URL` for the same
reason: the lane does not exist, so the default list skips it and naming it explicitly fails.

**Leaving `mail` out is allowed, and it is your job to serve it elsewhere.** Every sign-up's
verification link is a mail job. The same goes for `event`: without it the outbox is never drained.

Every process still registers the schedules and runs the partition check at boot, whatever lanes it
serves. Registration is idempotent, and a schedule only puts jobs on a queue — the lane that
serves the queue runs them.

## Two ceilings, checked before the first lane starts

1. **Per queue:** a lane's concurrency may not exceed `QueueLimits`. Analytics is 1, because
   correctness rests on one writer.
2. **Per process:** the sum across the selected lanes may not exceed
   `WORKER_PROCESS_MAX_CONCURRENCY` (64). The error names each lane's variable and value.

Both are refusals, and both happen before any lane starts. A refusal halfway would leave a process
consuming some queues and then exiting.

The older `worker.pool.oversubscribed` warning still runs after boot. It compares the lanes that
started, mail excluded, against `DATABASE_POOL_MAX` — see [`env.md`](./env.md). The ceiling is a
hard stop on a process that is clearly misconfigured; the warning is about the pool you actually
have.

## What comes next

This is the static half of `plans/WORKER-CONTROL-PLAN.md`. The runtime controls — the process
registry, pause and resume, moving queues and autoscaling from the platform dashboard — reconcile
this same lane list instead of replacing it.

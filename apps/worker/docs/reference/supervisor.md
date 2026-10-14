---
title: The supervisor
description: Lanes, WORKER_QUEUES, the ceilings checked at boot, and the reconcile loop that applies the platform Workers page — pause, queue moves and autoscaling — to a running process.
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

## At runtime: the Workers page reaches a running process

The platform **Workers** page (`/platform/workers`, `platform.worker.read` to see it,
`platform.worker.manage` to change anything) changes what a running process does. It never starts
or stops a process; that is the host's job.

| Change | Where it is held | Who obeys it |
|---|---|---|
| Pause a whole queue | `worker_queue_settings.paused`, and BullMQ's own pause on the queue | Every process, including one started later |
| Pause one process, or one queue on one process | That process's overrides in Redis | That process, until it restarts or is reset |
| Change a process's queues | Its overrides; replaces `WORKER_QUEUES` | That process, until it restarts or is reset |
| Autoscale a queue | `worker_queue_settings` | Every process serving the queue |

**Within a second, or five at worst.** A change publishes on `worker:control` and the named process
reconciles at once. Every process also reconciles every 5 s, so one that missed the message catches
up on its own.

### One reconcile pass

1. Read the process's overrides and every `worker_queue_settings` row.
2. Close lanes no longer wanted, and start missing ones. A closing lane finishes its active jobs.
3. Pause or resume lanes from the overrides. Active jobs finish; nothing new starts.
4. Autoscale each lane from its queue's waiting count (`WorkerAutoscaleRules`).
5. Write the heartbeat, which is what the page lists.

Passes never overlap. A signal that arrives during a pass queues exactly one more.

### Autoscaling is concurrency, not processes

With autoscale off, a lane runs at its `WORKER_<Q>_CONCURRENCY`. With it on, concurrency moves
between the saved minimum and maximum:

- **Up** by `step` when waiting jobs reach the threshold, at most once every 10 s.
- **Down** by `step` once the queue has been empty for the scale-down delay.
- **Never above** the saved maximum, `QueueLimits`, or what `WORKER_PROCESS_MAX_CONCURRENCY` leaves
  after the process's other lanes.
- **Not at all** while the queue or lane is paused: a paused backlog is not demand.

The settings are per process. A maximum of 8 with three processes serving the queue is up to 24
jobs at once.

### Where the state lives

Everything per process is on the **queue** Redis, never the cache. The cache evicts, and an evicted
override is a paused process that silently resumes.

| Key | What |
|---|---|
| `worker:procs` | Sorted set of process ids by heartbeat; stale ids pruned on read |
| `worker:proc:{id}` | The heartbeat, with a 15 s TTL |
| `worker:proc:{id}:overrides` | The dashboard's per-process settings, with a 60 s TTL the heartbeat refreshes |
| `worker:control` | Pub/sub channel; the message is `all` or one process id |

A process id is `host-pid-random`, new on every boot, so a restarted process never inherits the
overrides set on the one before it. A process killed without a drain drops off the page once its
heartbeat expires; a clean shutdown removes it at once.

**A queue paused in the database is re-applied at boot.** BullMQ keeps its pause in Redis, so after
a queue Redis migration the first worker to boot that serves a paused queue copies the pause back
onto it.

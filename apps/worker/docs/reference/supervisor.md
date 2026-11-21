---
title: The supervisor
description: Lanes, WORKER_QUEUES, the ceilings checked at boot, and the reconcile loop that applies the platform Workers page — pause, queue moves and autoscaling — to a running process.
---

# The supervisor

**A process runs lanes; `WORKER_QUEUES` picks which.** A lane is one queue in one process — a BullMQ
`Worker` with its own concurrency — so scaling embedding no longer copies mail, outbox and their
connections.

| Piece | File | Job |
|---|---|---|
| `LaneRegistry` | `src/supervisor/lane-registry.ts` | Every queue this build can serve, in start order, with its starting concurrency and the variable that sets it |
| `QueueLimits` | `packages/application/src/primitive/queue-limits.ts` | The most one process may run of each queue, whatever the environment says |
| `WorkerSupervisor` | `src/supervisor/worker-supervisor.ts` | Checks the ceilings, starts the selected lanes, and closes them on drain |

## `WORKER_QUEUES`

A comma list of queues; unset or empty serves all.

```bash
# One service for the light queues, one for embedding with three replicas.
WORKER_QUEUES=mail,event,notification,maintenance
WORKER_QUEUES=embedding
```

Copies split a queue's jobs (one taker per job; schedules dedupe by id). **A wrong name fails boot** — a
typo is an undrained queue that looks quiet. `analytics` is refused without `CLICKHOUSE_URL` for the same
reason: the default list skips the lane, and naming it fails.

**Omitting `mail` or `event` is allowed — serve them elsewhere** (every sign-up mails; `event` drains the
outbox). Every process still registers schedules and runs the boot partition check (idempotent; lanes run
the jobs).

## Two ceilings, checked before the first lane starts

1. **Per queue:** a lane's concurrency may not exceed `QueueLimits`. Analytics is 1, because
   correctness rests on one writer.
2. **Per process:** the sum across the selected lanes may not exceed
   `WORKER_PROCESS_MAX_CONCURRENCY` (64). The error names each lane's variable and value.

Both refuse before any lane starts (halfway would consume some queues, then exit). After boot,
`worker.pool.oversubscribed` warns about the real pool ([env](./env.md)).

## At runtime: the Workers page reaches a running process

The platform **Workers** page (`/platform/workers`; `platform.worker.read` / `.manage`) changes what a
running process does — never starting or stopping one (the host's job).

| Change | Where it is held | Who obeys it |
|---|---|---|
| Pause a whole queue | `worker_queue_settings.paused`, and BullMQ's own pause on the queue | Every process, including one started later |
| Pause one process, or one queue on one process | That process's overrides in Redis | That process, until it restarts or is reset |
| Change a process's queues | Its overrides; replaces `WORKER_QUEUES` | That process, until it restarts or is reset |
| Autoscale a queue | `worker_queue_settings` | Every process serving the queue |

**Within a second, five at worst:** a change publishes on `worker:control`; every process also reconciles
every 5 s.

### One reconcile pass

1. Read the process's overrides and every `worker_queue_settings` row.
2. Close lanes no longer wanted, and start missing ones. A closing lane finishes its active jobs.
3. Pause or resume lanes from the overrides. Active jobs finish; nothing new starts.
4. Autoscale each lane from its queue's waiting count (`WorkerAutoscaleRules`).
5. Write the heartbeat, which is what the page lists.

Passes never overlap; a mid-pass signal queues one more.

### Autoscaling is concurrency, not processes

With autoscale off, a lane runs at its `WORKER_<Q>_CONCURRENCY`. With it on, concurrency moves
between the saved minimum and maximum:

- **Up** by `step` when waiting jobs reach the threshold, at most once every 10 s.
- **Down** by `step` once the queue has been empty for the scale-down delay.
- **Never above** the saved maximum, `QueueLimits`, or what `WORKER_PROCESS_MAX_CONCURRENCY` leaves
  after the process's other lanes.
- **Not at all** while the queue or lane is paused: a paused backlog is not demand.

Per process: a maximum of 8 on three processes is 24 at once.

### Where the state lives

All on the **queue** Redis — an evicted override is a paused process silently resuming.

| Key | What |
|---|---|
| `worker:procs` | Sorted set of process ids by heartbeat; stale ids pruned on read |
| `worker:proc:{id}` | The heartbeat, with a 15 s TTL |
| `worker:proc:{id}:overrides` | The dashboard's per-process settings, with a 60 s TTL the heartbeat refreshes |
| `worker:control` | Pub/sub channel; the message is `all` or one process id |

Ids are `host-pid-random`, new per boot, so restarts inherit no overrides; a killed process drops off
when its heartbeat expires, a clean one at once. **Database pauses are re-applied at boot**, so a queue
Redis migration does not unpause.

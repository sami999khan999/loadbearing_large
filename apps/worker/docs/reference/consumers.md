---
title: The consumers
description: Three consumers, all serial, all with a public handle() — the batch sizes and why they are what they are, and the failure each one exists to make visible.
---

# The consumers

| Consumer | Queue | Jobs | Registered |
|---|---|---|---|
| `MaintenanceConsumer` | `MAINTENANCE` | sweep · partitions · archive | always |
| `EmbeddingConsumer` | `EMBEDDING` | index | always |
| `AnalyticsConsumer` | `ANALYTICS` | project · reconcile | only with a ClickHouse config |

## `handle()` is public on every one of them

This — not `start()` — is the consumer's unit of work. `start()` is the BullMQ binding around it and
needs a live Redis, so **a private handler is a handler no test can reach.**

## Every consumer is serial

`MaintenanceConsumer` takes table-level locks and runs nightly; two overlapping runs buy nothing and
can deadlock on the same partition.

`AnalyticsConsumer` is serial **regardless of what is configured elsewhere**, and this one is not a
dial worth turning: two overlapping runs read the same checkpoint, project the same rows, and turn
one batch into two. Correctness here rests on there being exactly one writer — not on the insert
being idempotent, though it is that too.

## `MaintenanceConsumer` exists because a schedule had no consumer

`CleanupSchedule` published onto `MAINTENANCE` and nothing was listening, so the jobs accumulated
silently. That is why this file was written before the rest.

An unknown job name **throws** rather than succeeding quietly: a schedule renamed on one side and not
the other should be loud.

| Constant | Value | Why |
|---|---|---|
| months of partition runway | 3 | A partitioned table with no partition for the current date rejects **every** insert. At one month, a single missed run is a total write outage at midnight on the first; at three, the job can fail twice before anything breaks |
| archive reach-back | 13 months | Keeps a full year queryable in Postgres and archives the month that has just fallen out of it |

The month to archive is computed **from the clock**, not passed in the job payload, so a redelivered
job archives the same month rather than one relative to whenever the retry happened.

**`MONTHS_PER_RUN` counts partitions, not runway, and the two differ by one.** Three is the current
month and the next two, so the job survives two consecutive missed runs and the third is a write
outage. The constant used to be called `MONTHS_AHEAD`, which read as three months of runway and was
never that — the log field is `months` for the same reason.

**The sweep takes expired invitations as well as sessions and verifications**, and that one is not
housekeeping: `invitations_email_uq` is on `(organization_id, email)`, so a lapsed row keeps that
address un-invitable until something removes it. Nobody would connect "re-invite says the address
already has an invitation" to a row that expired last month.

## `EmbeddingConsumer` catches nothing, on purpose

```ts
// Let it throw.
```

BullMQ's retry and backoff are driven by rejection, so catching and logging inside the handler turns
a retryable failure into **permanent, silent data loss**.

Failures are observed from the `failed` **event** instead, never from a `catch` inside the handler:
the listener does not swallow, so BullMQ still sees the rejection and still retries.

Everything worth testing lives in `IndexDocumentUseCase`.

## `AnalyticsConsumer`: two jobs, one failure

Both jobs exist because of the same failure, and it is **not** an outage: it is a projection that
stopped quietly on a Tuesday and was noticed a quarter later when a report looked wrong. `project`
moves the rows; `reconcile` is what notices when it has not been.

It is registered only when the container was built with a ClickHouse config — a consumer polling a
store that is not running looks identical to a working one.

### `project`

Read the checkpoint **out of the destination**, walk forward in keyset batches, stop when a batch
comes back short. The checkpoint advances because rows landed, never because a batch was
acknowledged, so a projector that failed mid-insert resumes from what is actually in the table. See
[`infrastructure/docs/reference/clickhouse.md`](../../../packages/infrastructure/docs/reference/clickhouse.md).

| Constant | Why |
|---|---|
| batch size | Large enough that ClickHouse merges a small number of big parts. A thousand single-row inserts create a thousand parts and the background merge never catches up |
| max batches per run | A ceiling on one job, not on the backlog. Without it the first run after a long outage holds a Postgres connection for a full replay; with it the job stops, the schedule fires again in five minutes, and the checkpoint resumes exactly where it ended |
| lag threshold | Two runs of the schedule. One late run is a slow batch; two is a consumer that has stopped |

A short batch means the replay has caught up — continuing would issue one more query to learn what
the length already said.

**Lag is warned on separately, at `warn` rather than `debug`.** A projection that throws is already an
error line; one that quietly falls further behind every run produces nothing at all.

**Lag is the age of the oldest row still unprojected — not the age of the newest projected one.**
Those differ in exactly the case the metric exists for. The second measures how recently anything
happened, so a caught-up deployment that has been quiet for ninety minutes reports ninety minutes of
lag and trips the threshold every run; and a run that stopped at its batch ceiling reports the age of
the last row it *did* write, which understates a backlog rather than overstating it. Both readings
are wrong in the direction that costs the most: a false alarm nobody can act on, and a real backlog
that looks smaller than it is.

Caught up means zero, and the run already knows it is caught up — a short or empty batch is what
stopped the loop. Only a capped run pays for the answer, with one keyset query for the next row after
the checkpoint, which is the run where knowing the true backlog age is worth a query.

### `reconcile`

Counts per day on both sides and a diff. **Neither store reaches into the other** — each answers the
same question in the same shape and this compares the answers, which is what keeps both adapters
single-store.

Today is excluded: it is still being written to, so a difference in it is timing rather than drift,
and a check that cries wolf daily is a check nobody reads.

Drift is logged **one line per drifting day**, not one line listing them — a log field is something
you filter and alert on, and the day is exactly the grain an operator groups by when deciding how far
back to replay.

It logs at `error`, not `warn`: every number a dashboard has shown since the first drifting day is
wrong, and the fix is a replay — which only works while the activity log still covers the window, so
the alert has a deadline attached.

**`reconciliation.completed` is emitted whether or not anything drifted, and carries the count.** It
used to return early on drift, which made two very different situations the same absence: a
reconciliation that is running and finding drift, and a consumer that has stopped running at all.
The one signal an operator needs from this job is "it ran"; making that signal conditional on the
answer being clean is the same mistake as not having the job.

The `projection` label rides every line this consumer emits. There is one projection today; the field
exists so a second one does not change the event shape, and so a dashboard filters on it rather than
on the queue name.

## `DigestComposer`

The only reader of the `email` namespace in the repository, and it reads copy the way everything else
does — through `ContentSource` — so a subject line and a button label share one `Translator`, one
interpolation implementation and one typo fix.

The recipient's locale is a parameter, so a per-recipient subject line is a second call rather than a
second system. Rendering per recipient is cheap; **resolving permissions per recipient is not**, so
the caller groups recipients by capability shape and queries once per group.

> [!NOTE]
> Nothing constructs `DigestComposer` outside its own spec, and `QueueName.NOTIFICATION` has no
> consumer — `P8.3`.

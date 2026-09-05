---
title: The schedules
description: Five repeatable entries, the fixed job ids that make registration idempotent, the clock order that keeps them off each other's locks, and why none of them retries.
---

# The schedules

| Schedule | When | Queue |
|---|---|---|
| `partitions-monthly` | 02:00 on the first | `MAINTENANCE` |
| `cleanup-daily` | 03:00 daily | `MAINTENANCE` |
| `archive-monthly` | 04:00 on the first | `MAINTENANCE` |
| `reconcile-daily` | 05:00 daily | `ANALYTICS` |
| `projection` | every five minutes | `ANALYTICS` |

## The clock order is not arbitrary

On the first of the month all three monthly jobs run, in this order and for these reasons:

- **02:00 partitions.** A sweep that runs while the current month has no partition fails on a table
  it cannot write to, so the runway is extended before anything else touches `activity_log`.
- **03:00 cleanup.** After the runway exists.
- **04:00 archive.** After both, so the three never contend for the same locks.
- **05:00 reconcile.** So on that one morning of the month it reads a window the archive job has
  already finished with.

## A fixed job id is what makes registration idempotent

Every schedule registers on **every boot**. Without a fixed id, each deploy adds another repeatable
entry and the nightly job runs eleven times by Friday.

The `Queue` object exists only to publish the repeatable entry and is closed immediately: left open
it holds a second connection to the queue instance for the life of the process.

Schedules register **after** the consumers start, so a repeatable entry that fires the instant it
lands has somewhere to run. Registering a schedule onto a queue with no consumer is what left
`cleanup-daily` silently accumulating.

## None of them retries, and each for its own reason

**`archive-monthly`: one attempt.** A retry would re-run `detach` on a partition that is already
detached and fail on *that* instead of on whatever actually broke, burying the real error. Re-run it
by hand once the cause is known. See
[`infrastructure/docs/reference/activity-archive.md`](../../../packages/infrastructure/docs/reference/activity-archive.md).

**`projection`: the schedule is the retry.** A failed run leaves the checkpoint where it was, and the
next tick five minutes later resumes from exactly the same place. A retry inside the job buys nothing
and stacks a second run on top of one that may still be holding a connection.

## Why five minutes, and not five seconds

The analytics queue is the one that is allowed to fall behind — nobody waits on a dashboard row — and
a five-minute cadence keeps each run a handful of large inserts rather than a stream of small parts
ClickHouse then has to merge.

`projection` and `reconcile-daily` register **only when the container holds an `AnalyticsProjector`**.
A schedule with no consumer accumulates silently; a schedule with a consumer but no store is worse,
because it looks like it is working.

## `partitions-monthly` has a real deadline

Migration `0000` created partitions through 2027-01. The day after the last one ends, **every insert
to `activity_log` fails** — which under the analytics design is also every analytics write.

## `archive-monthly` is what makes replay possible

It detaches the month that has just aged out of the retention window, ships it to S3 as gzipped
NDJSON, and records it in `activity_archive`. That table is what makes a ClickHouse replay past the
Postgres window automatable rather than archaeology, and nothing wrote to it before this schedule
existed.

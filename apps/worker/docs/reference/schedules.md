---
title: The schedules
description: Nine repeatable entries and one boot job, the fixed job ids that make registration idempotent, the clock order that keeps them off each other's locks, and why only the digest retries.
---

# The schedules

| Schedule | When | Queue |
|---|---|---|
| `outbox-drain` | every second | `EVENT` |
| `partitions-monthly` | 02:00 on the first | `MAINTENANCE` |
| `cleanup-daily` | 03:00 daily | `MAINTENANCE` |
| `retention-daily` | 03:30 daily | `MAINTENANCE` |
| `orphans-daily` | 04:00 daily | `MAINTENANCE` |
| `analytics-reconcile` | 05:00 daily, with a projector | `ANALYTICS` |
| `digest-hourly` | on the hour | `NOTIFICATION` |
| `spares-topup` | every five minutes | `MAINTENANCE` |
| `analytics-projection` | every five minutes, with a projector | `ANALYTICS` |

`partitions-boot` is not repeatable: `runOnce()` adds it at every boot, before the schedules register.
`digest-hourly` sends only tenants whose digest hour it is (`26.7`; unset is 07:00 UTC) and removes the
retired `digest-daily` entry, which would otherwise double-send.

## The clock order is not arbitrary

On the first of the month:

- **02:00 partitions** — the runway is extended before anything touches `activity_log`; the same job
  archives and drops what aged out.
- **03:00 cleanup**, after the runway exists. **03:30 retention** (bucket lifecycle and ClickHouse TTL
  converged, archive rows expired, deleted tenants swept) and **04:00 orphans** run no partition DDL.
- **05:00 reconcile**, reading a window retention has finished with.

## Every time is UTC

BullMQ reads cron in the process timezone, so a non-UTC host ran nightly jobs at local hours (and the
digest's UTC day could be wrong). Each entry passes `tz: "UTC"` via `UtcCron`; since `tz` is part of the
key, registration first removes the old tz-less entry, else both run.

## A fixed job id is what makes registration idempotent

Every schedule registers on **every boot** — without a fixed id the nightly job runs eleven times by
Friday. The `Queue` is closed right after publishing (else a second connection for life). Schedules
register **after** consumers start, so an instant fire has a runner — a consumerless schedule once left
`cleanup-daily` silently accumulating.

## Only the digest retries

Maintenance and analytics entries run once (`attempts: 1`): **the schedule is the retry.**
`partitions-monthly` retrying would re-`detach` a detached partition and bury the real error — a failed
tenant-month is logged, the loop continues, nothing it touched was dropped
([cold-storage](../../../../packages/infrastructure/docs/reference/cold-storage.md)). A failed `projection`
leaves its checkpoint, and the next tick resumes there. The digest has five attempts backing off from a
minute — one failed fan-out would otherwise be every due tenant's digest.

## Why five minutes, and not five seconds

Analytics may fall behind (nobody waits on a dashboard row), and five minutes keeps each run a few large
inserts rather than parts ClickHouse must merge. Both analytics entries register **only with an
`AnalyticsProjector`** — a consumer with no store looks like it works.

## `partitions-monthly` has a real deadline

Each tenant's months come from this job (and spare seeding); **the day a tenant's last month ends,
every insert to its `activity_log` fails** — and with it every analytics write. It walks
`PartitionedTable.MONTH_PARTITIONED`, not `activity_log` by name, logging
`maintenance.partitions.ensured` per table and tenant as fields — a new table is one list entry, each with
its own deadline.

## `outbox-drain` is the only sub-minute schedule here

Every second — the outbox's commit-to-delivery budget. A poll on purpose: `LISTEN`/`NOTIFY` is the
upgrade once a measured budget under 500 ms is needed; a shorter interval multiplies empty queries. Fixed
`jobId`, `priority: 1` so its deliveries cannot starve it.

## Retention archives, then drops — and one table is guarded

`partitions-monthly` also retires months behind: detach, stream to S3, record in `partition_archive`,
verify, then drop — `activity_log` at thirteen months, `notifications` twelve, `outbox_event` two;
`messages` (domain data) is archived with reactions and files only when a retention row says so, never
dropped (`26.4`). **`outbox_event` is guarded:** an unpublished row older than the cutoff halts the prune.
`activity_log` also reaches ClickHouse, so a tenant the projection lags keeps a null `projected_at` and
logs `analytics.projection.gap` — archived and dropped anyway: a known hole, never an unbounded table. See [`cold-storage.md`](../../../../packages/infrastructure/docs/reference/cold-storage.md).

## A schedule fires once; the job it enqueues walks every node

No schedule has a shard dimension — per-node entries would need N-fold idempotency and deregistration
and would drift from the cluster. One entry; the consumer loops nodes ([consumers](consumers.md)). So
`runOnce()` at boot recovers the runway on **every** node.

**The boot job keeps no failure** (`CR.17`): `partitions-boot`'s fixed id dedupes replicas, but BullMQ
ignores an `add` whose id sits in the failed set — one boot with Postgres down once disabled recovery for
good. `removeOnFail: true`; the failure still logs `queue.job.failed`.


---
title: The consumers
description: Seven consumers, each with a public handle() — the batch sizes and why they are what they are, and the failure each one exists to make visible.
---

# The consumers

| Consumer | Queue | Jobs | Registered |
|---|---|---|---|
| `MaintenanceConsumer` | `MAINTENANCE` | cleanup · partitions · retention · orphans · spares · doc-* · tenant-* · cold-restore | always |
| `EmbeddingConsumer` | `EMBEDDING` | index · reembed · doc-reindex | always |
| `MailConsumer` | `MAIL` | send | always |
| `OutboxConsumer` | `EVENT` | drain · deliver | always |
| `NotificationConsumer` | `NOTIFICATION` | digest-fanout · digest | always |
| `AnalyticsConsumer` | `ANALYTICS` | project · reconcile · cold-reproject | only with a ClickHouse config |
| `AssistantConsumer` | `ASSISTANT` | one answer per job | only with an `ASSISTANT_PROVIDER` |

## `handle()` is public on every one of them

It is the unit of work; `start()` is the BullMQ binding and needs live Redis — **a private handler is
one no test can reach.**

## Two consumers are serial

`MaintenanceConsumer` (table locks; overlaps can deadlock a partition) and `AnalyticsConsumer` (capped
at 1: two runs read one checkpoint and project a batch twice) are serial; the others scale by concurrency.

## `MaintenanceConsumer` exists because a schedule had no consumer

`CleanupSchedule` once published to a queue nobody consumed. An unknown job name **throws** — a rename on
one side must be loud.

| Constant | Value | Why |
|---|---|---|
| months of partition runway | 3 | A table with no current partition rejects **every** insert; three survives two missed runs |
| `activity_log` retention | 13 months | A full year queryable; set on the allowlist like every table |

**No `archive` job:** `partitions` ensures the runway, then retires aged months archive-then-drop. The
cutoff comes from the clock and `PartitionedTable.byName(table).retentionMonths`, so a redelivery retires
the same months. One log line per table-month (not per tenant); a failed tenant upload is logged and
skipped, nothing dropped ([cold storage](../../../../packages/infrastructure/docs/reference/cold-storage.md)).
`MONTHS_PER_RUN` (3) counts partitions — current plus two — not runway (once misnamed `MONTHS_AHEAD`).

**The sweep takes expired invitations too** — `invitations_email_uq (organization_id, email)` keeps a
lapsed row's address un-invitable. **`retention` converges four things:** lifecycle rules, ClickHouse TTL
and expired `partition_archive` rows follow policy rows; `sweepDeletedTenants` deletes objects of tenants
gone longer than `DELETED_TENANT_DAYS` (the thirty-day window), logging `cold.objects.swept`
(`reason: "tenant_deleted"`) only when it removed something.

## `EmbeddingConsumer` catches nothing, on purpose

```ts
// Let it throw.
```

Retries are driven by rejection, so a `catch` turns a retryable failure into **silent, permanent loss**;
failures are observed from the `failed` event, which does not swallow. Logic lives in
`IndexDocumentUseCase`. **Three job names:** `index` carries a document; `reembed`
(`ReembedChunksUseCase`) and `doc-reindex` (`--docs`, `ReindexDocsUseCase`) name a tenant, queued one per
organization by `pnpm ai:reindex`, each placed on the tenant's node.

## `AnalyticsConsumer`: two jobs, one failure

Both answer one failure — a projection that stopped quietly on a Tuesday, noticed a quarter later.
`project` moves rows; `reconcile` notices when it has not. Registered only with ClickHouse configured.

### `project`

Checkpoint read **from the destination**, keyset batches until one is short — it advances because rows
landed, so a mid-insert failure resumes from reality. See
[`infrastructure/docs/reference/clickhouse.md`](../../../../packages/infrastructure/docs/reference/clickhouse.md).

| Constant | Why |
|---|---|
| batch size | Few big parts — single-row inserts outrun the merge |
| max batches per run | Caps one job, not the backlog — else a post-outage run holds a connection for a full replay |
| lag threshold | Two schedule runs — one late run is slow, two is stopped |

- **The assistant meter rides the same run** — `ai_usage` → `ai_usage_events`, same checkpointing, keyset,
  horizon, shard scope and remaining budget; no exclusion list.
- **A run resumes where the last stopped, and wraps** (`CR.20`) — from id order, one early backlogged
  tenant spent the budget every time. The cursor lives in the cache a day; `tenants` counts those reached.
- **Between sweeps only marked tenants are walked** (`CR.20`): writers mark `analytics:backlog` (a sorted
  set by latest write); a run walks the oldest thousand, clears caught-up ones only through the settle
  horizon, and re-marks cut-off or failed ones at the back.
- **Lost marks are covered by a sweep** — marks are best-effort before commit, so a missing
  `analytics:project:swept` key (set an hour after a clean full sweep) or unreadable marks trigger a full
  sweep: at most an hour late, never a lost row. `mode` says `marked` or `sweep`.
- **One tenant's failure does not stop others** (`analytics.projection.failed`; the first error rethrows
  at the end); **three in a row stop the run** — that is the store (a dev stack once logged 180 lines).
  Post-failure lookups are guarded (`CR.44`); an unreadable checkpoint reports `eventId: "unknown"`.

**The walk stops thirty seconds behind the clock — not tuning.** `occurred_at` is stamped at transaction
*start* and commits land out of order, so without a horizon the strictly-greater keyset passes a row not
yet visible and never reads it: silent loss. Thirty seconds exceeds any transaction; the lag query uses
the same horizon.

- **Lag warns at `warn`** — a quietly falling-behind projection otherwise logs nothing.
- **Lag is the oldest unprojected row's age**, not the newest projected one's (which alarms on quiet
  deployments and understates a capped backlog). Caught up is zero; only a capped run pays one query.
- **`projection_policy` is read once per run**, and feeds the lag query too (excluded rows would never
  clear).
- **`platform_policy.projection_enabled` false returns at once**, logging nothing; `applyRetention` still
  runs.
- **A tenant with no directory row is skipped** (`23.21`) with `analytics.tenant.skipped` at `error` and
  a `skipped` count — decided by asking the directory after the throw; an unreachable catalog still fails
  the run, or an outage would look like success.

### `reconcile`

Daily counts from each store, diffed — **neither reaches into the other**. Today is excluded (timing,
not drift). Drift logs **one `error` line per day** — the grain an operator replays by, with a deadline
while the activity log still covers it. **`reconciliation.completed` always fires with the count** — "it
ran" must not depend on a clean answer. A `projection` label rides every line, for a future second
projection.

### `cold-reproject`

An archived month from S3 into the derived store — here because **this consumer owns the projector**.
Per object: read via `ColdArchiveReader` (checksum and count verified), map with the live replay's
`ActivitySubject.of`, **drop excluded actions**, batch-insert, then stamp `projected_at` last (an early
stamp hides a gap). `ReplacingMergeTree` makes reruns harmless, so the button needs no confirmation.

## `MailConsumer` is the only thing in this system that sends

Every message is a job — retries, backoff and id dedupe — at one cost: **in development, mail arrives
only while the worker runs.** The provider cap is a worker `limiter` (`Env.mailRatePerMinute` per
minute), never a caller's sleep. **`mail.delivery.failed` fires from the `failed` listener on the last
attempt only** (`attemptsMade === opts.attempts`); the sent line carries the message id for provider
correlation ([mail pipeline](../../../../packages/composition/docs/reference/mail-pipeline.md)).

## `OutboxConsumer` runs two different jobs, and the split is the design

`drain` turns each unpublished event into one `deliver` job **per listening subscriber** — so a failure
is local, not a retry of every subscriber.

- **Job id `<subscriber>_<eventId>` dedupes** a crash between relay and mark; the window is a thousand
  deliveries or 24 hours (the drain's own `removeOnComplete: 10` once trimmed the shared set to ten; it is
  `true` now). Subscribers' idempotency on `event.id` is the guarantee.
- **Twelve attempts from five seconds** (~three hours) — the row is already published, so exhaustion needs
  `pnpm queue:replay event deliver` (kept a week). Others default to eight (~ten minutes).
- **`eachShard` continues past a failing node**, logging `shard.sweep.failed { node }` and rethrowing at
  the end.
- **Unlistened events are still marked published.**
- **Bounded drain** (100 × at most 20 batches) at `priority: 1`, deliveries at `priority: 10` — an
  unprioritised job sits on the plain wait list, which `moveToActive` empties first.
- **`outbox.drain.lagged`** at sixty seconds means "not running", not "busy".

## `NotificationConsumer` fans out one job per tenant, and never sends

`digest-fanout` publishes one `digest` job per tenant (so one failure stops nobody else); the digest
**enqueues** mail, never sends.

- **Job id `digest_<organizationId>_<day>` dedupes** double fires and redeliveries; the UTC day comes
  from `container.clock`.
- **The fan-out pages each node's catalog tenants** (500 at a time, one `addBulk` per page) — the old
  `SELECT DISTINCT` over `notifications` ran out of lock slots near 5 800 tenants. A tenant with nothing
  unread costs one pruned query.
- **A digest is four queries and one enqueue per 200 people** (candidates, addresses, modes, unread rows
  via a window function) over the half-open previous day; it places itself with `withShard`.

## Every cross-tenant pass loops the cluster, and the loop is over nodes

Passes without a tenant run in `container.eachShard`'s **node-only** scope `{ key: null, node }`:
`local` tables and routed reads resolve to that node, and `PgUnitOfWork` opens there; outside, node 0.

| Pass | What loops | What does not |
|---|---|---|
| `OutboxConsumer.drain` | the claim and the mark, per node | the fan-out: one Redis for the deployment |
| `OutboxConsumer.reportLag` | `oldestPendingAt`, per node | the line — one a run, from the **worst** node |
| `MaintenanceConsumer.partitions` | the runway and the prune, per node | `retentionPolicies`, read once for the run |
| `AnalyticsConsumer` project / reconcile | **per tenant**, not per node | the checkpoint: one ClickHouse, keyed by tenant |
| `NotificationConsumer.fanOut` | the catalog's tenants, per node, a page at a time | the queue, and the per-tenant `digest` job |

- **The projection loops tenants, not nodes** — physical passes (partitions, outbox claims) belong to
  one database; a projection is one tenant into one ClickHouse, placed per tenant, so a moved tenant
  resumes in place with no per-node checkpoint.
- **Tenant pages are narrowed by node** (`OrganizationReader.page(after, limit, onNode)`, a catalog
  `EXISTS` on `shard_assignments`), not filtered afterwards.
- **`cleanup` does not loop** — catalog tables would be swept N times.
- **`PgPartitionArchiveGateway` spans two placements on purpose** — detach on the walked node, record in
  catalog `partition_archive` via `BaseRepository.catalogDb` (throws unless `local`). The object key
  carries no shard (a tenant lives on one node, and a shard index would go stale on a move).


---
title: Cold storage
description: Retention stops meaning deletion — the tenant-month as the unit, the cold/ prefix, partition_archive as the index a read starts from, and the restore that proves the difference.
---

# `PgPartitionArchiveGateway`

Retention once destroyed months except `activity_log`'s; one mechanism now covers all: **every
partitioned table archives before it drops**, `outbox_event` included.

## The unit is the tenant-month

One tenant's month is one child table (`activity_log_<32hex>_2026_05`), archived one at a time.

- **The old object was one cross-tenant blob per month** — serving one tenant meant downloading
  everyone's; per-tenant objects are also the only presignable layout.
- **Per-tenant retention needs the tenant to be the partition** — over a shared one it would be a
  `DELETE`, the vacuum problem partitioning avoids.

## The order is the job

```
detach → stream to S3 → record → verify → drop
```

**The order is the point — dropping before verifying is loss.**

1. **Detach** `CONCURRENTLY` (no writer lock; hence not one transaction) — the upload is a closed set.
2. **Stream** gzipped NDJSON, compressed in passage so nothing holds the month in memory.
3. **Record**, before anything is destroyed.
4. **Verify** readable and complete — a `HEAD` proves existence, not bytes.
5. **Drop.**

An empty month leaves **no object and no row**, so an absent row means "nothing to restore".

## The key, and the one lifecycle rule it buys

```
cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz
```

One `cold/` prefix lets lifecycle rules cover every table without naming objects; the tenant is the
leaf. `outbox_event` (no tenant level) archives under `PartitionArchiveGateway.NO_TENANT`, the nil uuid —
"spans every tenant". **Rules are per table, composed from `retention_policy` rows** by
`RetentionRules.lifecycleFor`, sorted and compared before replacing the whole configuration
([storage policy](storage-policy.md)) — per table because **a bucket holds at most a thousand rules**. A
shorter tenant window is the nightly sweep's job; a longer one cannot be honoured, which
`update-tenant-retention` says. Months → days at 30.44, **rounded up**.

## `partition_archive` is the index a read starts from

```
partition_archive (organization_id, table_name, period) primary key
  object_key, row_count, bytes, checksum, action_counts, projected_at, archived_at
```

Tenant-first, so one tenant's months are read, swept and totalled alone (no `TENANT_EXEMPT` line).
`organization_id` is **not** a foreign key — the record outlives its tenant, hence the sweep below.

- **`bytes`** (from `StoredObject.size`) — the only per-tenant storage figure.
- **`action_counts`** — counted while streaming (`activity_log` only), so cold reconciliation can
  subtract excluded actions without reading back.
- **`projected_at`** — null means the derived store lacks it; a partial index finds holes.

## What the totals on `/platform/storage` are, and are not

`PgTenantStorageReader` sums `bytes` and `row_count` by `(organization_id, table_name)` — S3's reported
sizes, not a `ListObjectsV2` per tenant. **Cold only, and it says so** — hot bytes are not attributable
per tenant from the catalog (hot per *table* is on the retention screen). A **left** join keeps deleted
tenants' rows visible, showing the id.

## A gap is recorded, never silent, and never blocks a drop

After archiving, `MaintenanceConsumer` stamps `projected_at` where the tenant's checkpoint is past the
month, else logs `analytics.projection.gap` (`reason: "disabled" | "behind"`) — dropped either way: a known
hole a re-projection closes, not an unbounded table. Gap and `maintenance.partition.archived`
(`{ table, period, objects, rows }`) lines are one per table-month.

## Restore, and why it never re-attaches

`restore(table, period, organizationId)` streams into a **scratch table** `<child>_restore`, never the
live parent (re-attaching would fight retention), recreated each time. The spec archives, drops and
restores a month, matching `row_count` and an md5 of sorted ids — **an unrestored archive is a deletion
with extra steps.** Batches go in via `json_populate_recordset(null::<scratch>, …)`.

**Never whole in memory** (`CR.16`): a whole-object gunzip once OOMed the worker and blocked the event
loop past other queues' locks (double sends). Now `getStream` → `NdjsonLines` → batched inserts, hashing
compressed bytes and counting lines; a mismatch drops the scratch table and throws.
`ColdArchiveReader.batches` verifies in a **first pass** before projecting (corruption found at the end
would already be in ClickHouse); the archived-notifications page reads once, checking hash and count
before returning (50 MB cap bounds request time).

## Deleting a tenant reaches cold storage

Per-tenant objects survive a Postgres cascade — a GDPR hole this mechanism closes. `sweep(organizationId)`
deletes objects **then** rows (a crash leaves a re-runnable row, not an invisible object).
`DeleteOrganizationUseCase` does **not** sweep: objects stay thirty days, recoverable when a delete is
most likely a mistake. `sweepDeleted(before)` ends the window by a **tombstone** — `markTenantDeleted`
stamps `deleted_at` before the row goes; the sweep takes rows past the cutoff with no `organizations` row
(`not exists`), object then row, one `cold.objects.swept` line (`reason: "tenant_deleted"`) when it did
something.

> [!IMPORTANT]
> **Not `archived_at`:** keyed on archive time, the window measured each *month's* age — a year of cold
> months mostly died the night after a delete. It also destroyed every `outbox_event` archive (its
> `NO_TENANT` rows never match `organizations`). Outbox rows are never stamped, so the tombstone fixes both
> (`tests/cold/sweep-deleted.spec.ts`).

The immediate version, by hand:

```bash
pnpm db partitions --sweep <organization_id>
```

## An export is the same writer, pointed at live rows

`exportTenant(organizationId, day)` reuses the NDJSON-gzip path over **live** rows — no detach, drop or
`partition_archive` row; a copy, not the archive. One object per tenant and catalog table under
`export/<organization_id>/<yyyy-mm-dd>/<table>.ndjson.gz`, plus `manifest.json` (counts, sizes,
checksums); an empty table's object is uploaded then deleted (cheaper than counting twice).

Doc images copy from `doc/<organization>/` to `export/…/doc-image/<space>/<file>`, streamed and paged
(no memory or thousand-key limits), listed in the manifest as `table: "doc-image"`, `rowCount: 0`; ones
deleted mid-copy are skipped. The export page omits them; each day has a button saving a TSV of paths
and one-hour presigned links (`list-tenant-export-images`, `RW.4`):

```sh
while IFS=$'\t' read -r path url; do curl -fsS --create-dirs -o "$path" "$url"; done < links.tsv
```

Keyset on `id` (except `role_permissions`, keyed `(organization_id, role_id, permission)`) — `OFFSET`
skips live writes. Token hashes are nulled by re-serialising rows, not text replacement. `export/`
expires in seven days, the one rule not composed from a row —
[`storage-policy.md`](storage-policy.md).

## A failure between detach and drop re-attaches

Detach-to-drop runs in a `try`, **detach included** (`CR.15`): a failure re-attaches and rethrows —
else the month was **neither attached nor archived**, invisible to every query.

```ts
sql.raw(`alter table ${parent} attach partition ${name} for values from ('${from}') to ('${to}')`)
```

`sql.raw` because DDL takes no bind parameters; bounds come from a `Date` and the name from the closed
`PartitionedTableName` (D37). A cancelled concurrent detach leaves *detach-pending* — the unwind checks
`inhdetachpending` and runs `detach … finalize` first. The re-attach swallows its own failure (the caller
needs the original error).

**A killed run never unwinds** (`SIGTERM`, OOM), leaving a detach-pending child or an orphan table
`childrenOf` never sees. So retention calls `recover(table)` per node **first**: finalize pending detaches,
attach any unattached `<parent>_<yyyy>_<mm>`, log `cold.partition.recovered` — then the pass archives it.
`_restore` tables never match.

## The unwind stops the stream first, and waits for it

`Readable.from` keeps paging after `putStream` rejects — a wasted scan, and in specs a query racing the
partition drop. So the unwind destroys gzip and source **and awaits `close`** before re-attaching.

## NDJSON, and paging out of a detached partition

ClickHouse reads it with `s3(…, 'JSONEachRow', …)`. `row_to_json` makes each line, with sort column and
id alongside for the next cursor; the newline is a named constant (data, not formatting). Keyset on
`(<partition column>, id)`.

**The keyset needs an index, and only `activity_log` had one** (`CR.23`) — a 30-million-row outbox month
was three thousand scans with top-N sorts, timing out. A multi-page month now gets `<child>_walk` on the
detached table (direct pool), dropped with it — and by the unwind and `recover` before attaching. The
predicate is a variable because an inline ternary of `sql` templates is an inference cycle (implicit
`any`). **Count after detaching** — before, rows written between would be uploaded but uncounted.

## What happened to `activity_archive`

`0025` copied its rows into `partition_archive` (`table_name = 'activity_log'`) keeping object keys;
`0034` dropped it once no deployment could hold `activity-archive/` objects (none exists).

## The key does not carry the shard, and the index does not grow a column

A tenant lives on one node, so key and `(organization_id, table_name, period)` are cluster-unique; a
shard index would go stale on a move. The loop is per node; index rows go to the catalog via
`BaseRepository.catalogDb` ([sharding](sharding.md)).


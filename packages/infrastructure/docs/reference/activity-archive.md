---
title: The activity archive
description: Detach, stream, record, verify, drop — the order a partition leaves Postgres in, why NDJSON, and the two defects the shipped implementation still has.
---

# `PgActivityArchiveGateway`

`activity_log` is partitioned by month and is the highest-value record this system keeps. This
gateway is what lets an old partition leave Postgres without leaving the system.

## The order is the job

```
detach → stream to S3 → record → verify → drop
```

It is the order rather than the steps that matters. **Dropping before verifying is unrecoverable
loss of the audit trail.**

**1. Detach.** `CONCURRENTLY`, so the parent is not locked against writers while it happens — which
is also why the method as a whole is not one transaction, since a concurrent detach cannot run
inside one. Detaching first is what makes the export consistent: the partition stops receiving rows
the instant it is detached, so what gets uploaded is a closed set.

**2. Stream to S3** as gzipped NDJSON. Compression happens *between* the database and S3 rather than
at either end, so neither ever holds the month in memory. A `Gzip` stream is already an
`AsyncIterable` of chunks, which is why it needs no cast to reach `putStream`.

**3. Record**, before anything is destroyed.

**4. Verify** the object is readable and complete. A `HEAD` is not enough: it proves an object
exists, not that its bytes survived.

**5. Only now, drop.**

## NDJSON, not CSV

ClickHouse reads NDJSON back with `s3(…, 'JSONEachRow', …)` directly, which is what makes a cold
replay a query rather than an afternoon. `row_to_json` produces the line; the two key columns come
back beside it so the next page's cursor costs no extra round trip.

The separator is named as a constant because in NDJSON a newline is **data rather than formatting**,
and naming it keeps a formatter from ever treating it as the latter.

The row type is a type alias rather than an interface, and not by preference: drizzle's `execute<T>`
constrains `T` to `Record<string, unknown>`, which an interface does not satisfy because only
aliases get an implicit index signature.

## Paging out of a detached partition

Keyset pagination on the partition's own primary key, so a month that does not fit in memory never
has to. `OFFSET` would re-scan everything it already returned.

The predicate is built as a variable rather than inline: a ternary between two `sql` templates makes
the row type infer through `after`, which `after` is then assigned from — a cycle the compiler
reports as an implicit `any`.

The object key is `<subject>/<yyyy>/<mm>/…`, the same prefix layout every other object uses, so a
lifecycle rule can move archives to cold storage without naming them individually.

## Two defects, recorded here because the page is the honest place for them

Both are `P2.6` in `tasks/IMPLEMENTATION-PLAN.md`.

**The count runs before the detach.** `countOf(name)` is called ahead of `DETACH PARTITION`, so rows
inserted between the two are streamed to S3 but missing from `activity_archive.row_count`. The drift
is permanent and silent.

**A failure between detach and drop leaves the partition detached.** If `putStream` or the archive
insert throws, the partition is neither attached nor archived: its rows are invisible to every query
against the parent table, and nothing re-attaches it.

Until both are fixed, treat a failed archive run as needing a manual `ATTACH PARTITION` before it is
retried.

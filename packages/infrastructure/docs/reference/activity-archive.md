---
title: The activity archive
description: Detach, stream, record, verify, drop — the order a partition leaves Postgres in, why NDJSON, and what the unwind has to put back.
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

## The count is taken after the detach

`countOf(name)` runs **after** `DETACH PARTITION`, not before. Detaching first is what makes the
export a closed set, so counting first would count a different set from the one uploaded: rows
written in between would be streamed to S3 and missing from `activity_archive.row_count`, and that
drift is permanent and silent.

## A failure between detach and drop re-attaches

Everything from the detach to the drop runs inside a `try`. If `putStream`, the archive insert or
the verification throws, the partition is put back where it was and the original error is rethrown.

Without that, a failed run left the partition **neither attached nor archived**: its rows invisible
to every query against `activity_log`, and nothing to put them back but an operator who knew to look.

```ts
sql.raw(`alter table activity_log attach partition ${name} for values from ('${from}') to ('${to}')`)
```

`sql.raw`, because **Postgres accepts no bind parameters in DDL** — the same trap
`PgMaintenanceGateway` documents, and one the parameterised form fails silently into here because
the re-attach is deliberately best-effort. Both bounds are derived from a `Date`, so there is no
injection surface.

The re-attach swallows its own failure on purpose: the caller needs the error that started the
unwind, and a partition that will not go back is an operator's problem either way.

## The unwind stops the stream first, and waits for it

`Readable.from` starts pulling the moment it is piped, so by the time `putStream` rejects the
keyset loop is already paging. Nothing consumes those pages: in production a full scan of the month
that is thrown away, and in the spec a query still in flight when `afterEach` drops the partition —
an unhandled rejection reported beside a green suite rather than as a failure.

So the unwind destroys the gzip stream and its source **and awaits `close`** before re-attaching.
`destroy()` returns before the page already in flight does, and the caller drops the partition the
instant `archive()` throws. Waiting is what makes "no query is outstanding" true rather than likely.

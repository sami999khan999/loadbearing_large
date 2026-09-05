---
title: catalog
description: Why a log line has a code, why the level lives in the catalog rather than the call site, and how sampling becomes a per-code dial.
---

# `EVENT_CATALOG` and `EventShape`

```ts
export interface EventMeta {
  readonly level: LogLevel;
  readonly sample?: number;
}

export const EVENT_CATALOG: { readonly [code: string]: EventMeta };
export type EventCode = keyof typeof EVENT_CATALOG;

export interface EventShape { readonly "queue.job.failed": { … } }
export type EventFields<C extends EventCode> = EventShape[C];
```

Two halves, deliberately: the catalog decides *policy* per code, the shape declares *payload* per
code. Adding an event means one line in each, the same two-file rhythm `content` uses for a message
namespace.

---

## The level is in the catalog, not the call site

```ts
log.emit("queue.job.failed", { queue, jobId, attempt });
```

There is no `log.error(...)`. The code already carries its level, so the same event cannot be an
`error` in the consumer and an `info` in the retry path — which is the ordinary way a dashboard
built on levels stops meaning anything.

It also makes the level reviewable. Changing how loudly an event speaks is a one-line diff in a
table that someone owns, not a search-and-replace across call sites nobody will do.

## Fields are declared per event

```ts
export interface EventShape {
  readonly "queue.job.failed": {
    readonly queue: string;
    readonly jobId: string;
    readonly attempt: number;
  };
}
```

Three things follow, and the third is the reason:

**A misspelling is a compile error.** `{ jobID }` does not compile, so a dashboard filtering on
`jobId` keeps working.

**A dashboard keys on a name that cannot drift.** The field list is a declaration, not an emergent
property of whatever the first call site happened to pass.

**A token cannot be logged unless somebody declared a field for it** — on this line, in this file,
where a reviewer looking at a diff sees it. `Redactor` is the runtime backstop for what a `child()`
binding drags in; this is the primary defence, and it works at compile time.

> [!NOTE]
> `EventFields<C>` indexes `EventShape` by `EventCode`, so **an event with no declared fields is a
> compile error at that line**. The two halves cannot drift apart even though they are two files.

## Sampling is per code

```ts
"http.request.completed": { level: "info", sample: 0.1 },
"http.request.failed":    { level: "warn" },
```

One line per request is the highest-volume thing the system emits, and 10% is enough to see a
latency shift. Failures are never sampled — a dropped failure is the one thing this dial must not
buy you, and a spec asserts that no `warn` or `error` code carries a rate.

Sampling here rather than at the sink means the decision is visible next to the event it governs,
and it costs nothing when a code is not sampled: no draw is taken.

## Fragments, one per slice

```ts
export const EVENT_CATALOG = {
  ...coreEvents,
  // ...billingEvents,
} as const;
```

Same team-ownership seam as `permissions/catalog/` and `errors/catalog/`: one team, one file, no
merge conflicts in a shared list. A slice adds `<slice>.events.ts`, its entries in `EventShape`, and
one spread line here.

## The grammar

`<subject>.<thing>.<state>`, state in the past tense — `queue.job.failed`, `http.request.completed`,
`cache.entry.corrupt`, `dependency.request.failed`. It mirrors the activity-name rule for the same
reason: a log line records something that already happened. See
[Opinions · Vocabulary](../../../../docs/opinions/vocabulary.md).

## `error.raised` is not in the catalog

The one exception, and it is deliberate. `Logger.failure()` emits under `error.raised`, and its
level comes from `ERROR_CATALOG[code].severity` rather than from a table here — `expected → warn`,
`unexpected → error`. It is the only line in the system whose level is decided by the thing being
logged, because it is the only one where the emitter does not know in advance what it caught.

That is also the first consumer `ErrorMeta.severity` has ever had. See [logger](logger.md).

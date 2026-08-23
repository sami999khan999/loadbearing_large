---
title: "@loadbearing/observability"
description: One diagnostic stream — closed event codes, levels decided by a catalog, structured fields to stdout. The other half of the split that keeps errors free of prose.
---

# `@loadbearing/observability`

The audit trail answers *who did what*. This answers *what the system did*. They are two streams
with different sinks, different audiences, different retention, and different tolerance for loss,
and the fastest way to ruin both is to write them through one object.

| | `AuditTrail` | `Logger` |
| --- | --- | --- |
| **Sink** | Postgres, inside the transaction | stdout, fire-and-forget |
| **Audience** | users, compliance | operators |
| **Retention** | forever | days |
| **Written by** | use-cases | adapters and edges |
| **Losing a line** | a bug | fine |

| | |
| --- | --- |
| **Package** | `@loadbearing/observability` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/core` (`Clock`, `Uuid`), `@loadbearing/errors` — nothing else, ever |
| **Used by** | `db`, `infrastructure`, `auth`, `composition`, `apps/*` — **never** `application` |
| **Environment** | isomorphic — server, browser, worker, and Tauri webview |
| **Build** | `tsup` → `dist/index.js` + `dist/index.d.ts` |

```
packages/observability/
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── import.ts                ← Clock, SystemClock, Uuid, ERROR_CATALOG, ErrorNormalizer
│   ├── primitive/
│   │   ├── index.ts
│   │   ├── log-level.ts         → LogLevel, LogLevels
│   │   └── correlation.ts       → Correlation, TraceId
│   ├── catalog/                 ← one fragment per slice, team-owned
│   │   ├── index.ts             ←   EVENT_CATALOG, EventCode, EventMeta
│   │   └── core.events.ts
│   ├── event/
│   │   ├── index.ts
│   │   └── event-shape.ts       → EventShape, EventFields, LogFields, LogEntry
│   └── logger/
│       ├── index.ts
│       ├── logger.ts            → Logger        (abstract seam)
│       ├── json.logger.ts       → JsonLogger    ★ the one file allowed to call console
│       ├── silent.logger.ts     → SilentLogger
│       └── redactor.ts          → Redactor
└── tests/
    ├── primitive/ · catalog/ · logger/
```

---

## The rule everything else follows from

**The domain layer does not log.** A use-case records a business fact through `AuditTrail`, or it
throws a typed error. That is its entire vocabulary. Diagnostics are an adapter concern, and
`packages/application` does not depend on this package — `check-architecture.mjs` asserts it.

That one rule dissolves every hard problem at once:

- `application` keeps its three workspace dependencies and its nine ports.
- Nothing threads a third argument into `execute(actor, input)`.
- No `AsyncLocalStorage`, and no request-scoped state on the `Container`.
- A `ForbiddenError` is logged **once**, at the boundary that catches it, with its full structured
  context — rather than three times on the way up, each time with less of it.

Logging happens at the edges: the oRPC layer, the worker's consumers, the adapters in `db` and
`infrastructure`, and process boot and shutdown.

---

## Lines carry codes, not sentences

The same discipline `errors` applies to failures. A log line names an event from a closed union and
carries declared fields:

```ts
log.emit("queue.job.failed", { queue: "embedding", jobId: job.id, attempt: job.attemptsMade });
```

**The level is not at the call site.** `EVENT_CATALOG` says `queue.job.failed` is an `error`, so it
is an error everywhere — no adapter can quietly emit it at `info`. The call site says *what
happened*; the catalog says *how loudly*, and whether that code is sampled.

A typo is a compile error. So is a field the event does not declare. See
[catalog](reference/catalog.md).

---

## Reading the stream

One JSON object per line, fields flat at the top level — every aggregator indexes top-level keys,
where a nested `fields` object needs a parsing rule per deployment.

```json
{"level":"error","time":"2026-01-01T00:00:00.000Z","event":"error.raised","traceId":"0195…","code":"INTERNAL","cause":"Error: relation \"users\" does not exist","stack":"…"}
```

`traceId` is bound by `child()` at the request or job boundary, so every line for one request shares
it, and the same id is stamped onto the `ErrorEnvelope` the client receives. A user who says "it
broke" can read back a string that finds the exact line. See [correlation](reference/correlation.md).

---

## Nothing else may call `console`

Biome's `noConsole` is an error repo-wide, with an exemption list of four script contexts and
`json.logger.ts`. That file is the sink this rule exists to funnel everything into — the one place
allowed to call `console`, precisely so nothing else has to.

> [!NOTE]
> `console` is not declared under `lib: ["ES2024"]` either. It is reached as an optional property of
> `globalThis`, the same shape `ServerOnly` uses for `window` and `Uuid` uses for `crypto`. Third
> instance of that trap; expect a fourth.

---

## Testing

`JsonLogger` takes a `sink`, a `clock`, and a `random`, so a spec asserts on parsed lines with a
frozen timestamp and a deterministic sampling draw — no stdout capture, no fake timers. `TestContainer`
wires `SilentLogger`.

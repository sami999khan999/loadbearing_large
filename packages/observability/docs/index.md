---
title: "@loadbearing/observability"
description: One diagnostic stream — closed event codes, levels decided by a catalog, structured fields to stdout and on to Loki. The other half of the split that keeps errors free of prose.
---

# `@loadbearing/observability`

The audit trail answers *who did what*; this, *what the system did* — two of the four data streams, with
different sinks, audiences, retention and loss tolerance. Writing both through one object ruins both.

| | `ActivityLogger` | `Logger` |
| --- | --- | --- |
| **Sink** | Postgres, inside the transaction | stdout → Alloy → Loki |
| **Audience** | users, compliance | operators |
| **Retention** | 12–24 months of detail, partitioned monthly | 30 days |
| **Written by** | use-cases | adapters and edges |
| **Losing a line** | a bug | fine |

The other two streams are domain data and analytics; all four and the rule that separates them are
in [Data and scale](../../../docs/opinions/data-and-scale.md).

| | |
| --- | --- |
| **Package** | `@loadbearing/observability` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/core` (`Clock`, `Uuid`), `@loadbearing/errors` — nothing else, ever |
| **Used by** | `infrastructure`, `auth`, `composition`, `apps/*` — **never** `application` |
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
    ├── primitive/ · catalog/
    └── logger/  ← incl. wire-contract.spec.ts, the shape Alloy parses
```

---

## The rule everything else follows from

**The domain layer does not log** — a use-case records through `ActivityLogger` or throws a typed error;
`application` does not depend on this package (CI-asserted). So no third `execute` argument, no
`AsyncLocalStorage`, no request state on `Container`, and a `ForbiddenError` is logged **once**, with full
context, where caught. Logging happens at the edges: the oRPC layer, worker consumers, `infrastructure`
adapters, boot and shutdown.

---

## Lines carry codes, not sentences

As `errors` does for failures: a closed event union with declared fields.

```ts
log.emit("queue.job.failed", { queue: "embedding", jobId: job.id, attempt: job.attemptsMade });
```

**The level is not at the call site** — `EVENT_CATALOG` decides how loudly and whether sampled. Typos and
undeclared fields fail to compile ([catalog](reference/catalog.md)).

---

## Reading the stream

One flat JSON object per line (a nested `fields` would need a parsing rule per deployment); flat keys drop straight into Loki's `json` stage with no configuration.

```json
{"level":"error","time":"2026-01-01T00:00:00.000Z","event":"error.raised","traceId":"0195…","code":"INTERNAL","cause":"Error: relation \"users\" does not exist","stack":"…"}
```

**Four fields on that line are eligible to become labels**, and the pipeline reads all four out of
the body: `level`, `event`, and the `app` / `env` that `Container` binds onto every line. Everything
else (`traceId`, `code`, slice ids) stays in the body. `app` comes from the application, not a
container name (pod names on Kubernetes, nothing for `pnpm dev`). `traceId` is bound by `child()` at the
request or job boundary and stamped on the `ErrorEnvelope`, so a user's reference finds the line:

```logql
{app="web", level="error"} | json | traceId="0195…"
```

See [correlation](reference/correlation.md).

> [!WARNING]
> **Loki indexes labels, not fields.** The selector `{app="web", level="error"}` narrows the streams;
> `| json` parses the body afterwards. A `traceId` label creates
> one stream per request and is the single most common way a Loki deployment fails.
>
> The label set is closed: `app`, `env`, `level`, `event_code`. See
> [Data and scale](../../../docs/opinions/data-and-scale.md).
>
> `EVENT_CATALOG` (plus `ERROR_EVENT`, `error.raised`) is `event_code`'s cardinality budget — keep codes
> coarse.

---

## Nothing else may call `console`

Biome's `noConsole` errors repo-wide except four script contexts and `json.logger.ts`, the sink. Under
`lib: ["ES2024"]`, `console` is read off `globalThis`, as `ServerOnly` reads `window` and `Uuid` `crypto`.

---

## Testing

`JsonLogger` takes a `sink`, `clock` and `random`, so specs assert parsed lines with frozen time and
deterministic sampling; `TestContainer` wires `SilentLogger`.

**`wire-contract.spec.ts` is the one test that exists for something outside the workspace.** The
Alloy pipeline in `infra/alloy.config.alloy` addresses `level` and `event` by bare name at the top
level, and no compiler spans both files — rename, nest or pretty-print and it fails here, not as
unlabelled streams found in an incident.

---
title: "@loadbearing/composition"
description: The hand-written DI root that replaces a framework container. One class, no decorators, no reflection, no module graph — and the only place a vendor swap happens.
---

# `@loadbearing/composition`

The only package that knows both the abstract ports and their concrete implementations, because
wiring them together is its entire job. Every other package knows one side or the other.

That is also why it is the only place a swap happens. Moving from pgvector to Qdrant, from MinIO to
S3, from Better Auth to something else — each is one line here, and nothing upstream notices.

```bash
grep -rn "PgVectorStore" packages apps --include=*.ts
```

Hits in `packages/infrastructure` (where it is defined) and `packages/composition/src/container/` (where it is
named). Nothing between.

| | |
| --- | --- |
| **Package** | `@loadbearing/composition` (private, never published) |
| **Entrypoint** | `src/index.ts` — two exports, `Container` and `ContainerConfig` |
| **Depends on** | `application`, `auth`, `content`, `core`, `db`, `infrastructure`, `observability` |
| **Used by** | `apps/web`, `apps/worker`. **Never** `apps/desktop` — it holds no container ([30](../../../docs/setup/30-desktop-app.md)) |
| **Environment** | server-only; `ServerOnly.assert()` in `src/index.ts` is the runtime tripwire |

```
packages/composition/src/
├── index.ts                          ← ServerOnly.assert(). Two exports, and no more
├── import.ts                         ← every external symbol, both sides of every seam
├── container/
│   ├── index.ts
│   ├── container.config.ts           → ContainerConfig
│   ├── container.ts                  → Container
│   └── test-container.ts             → TestContainer, TestPorts   (off the barrel)
└── fake/
    ├── index.ts
    ├── in-memory.cache-store.ts      → InMemoryCacheStore
    ├── in-memory.storage-gateway.ts  → InMemoryStorageGateway
    ├── in-memory.vector-store.ts     → InMemoryVectorStore
    ├── recording.activity-logger.ts  → RecordingActivityLogger
    ├── recording.event-bus.ts        → RecordingEventBus
    ├── recording.queue-publisher.ts  → RecordingQueuePublisher
    ├── stub.analytics-reader.ts      → StubAnalyticsReader
    ├── stub.embedding-provider.ts    → StubEmbeddingProvider
    └── stub.session-resolver.ts      → StubSessionResolver

packages/composition/tests/
├── container/test-container.spec.ts
└── fake/fake.spec.ts
```

`import.ts` here is the longest in the repository, and that is the package working: naming a port
and its implementation exactly once is the whole deliverable.

**`fake/` and `test-container.ts` live in `src/`, and never reach `dist/`.** `tsup` builds from
`src/index.ts`, which names neither, so nothing is bundled — but `tsc` still checks them, and that is
the point: a port added to `application` is a **compile error** in `test-container.ts` until it has a
double. Verify with `grep -c "TestContainer\|InMemory" dist/index.js` → `0`.

## What it wires

| Field | Type it is exposed as | What it is today | Swapping it |
| --- | --- | --- | --- |
| `clock` | `Clock` | `SystemClock` | `FixedClock` in a test |
| `authorizer` | `Authorizer` | — | never; it is the kernel |
| `logger` | `Logger` | `JsonLogger` | `SilentLogger` in a test |
| `cache` | `CacheStore` | `RedisCacheStore` | one line |
| `storage` | `StorageGateway` | `S3StorageGateway` | one line |
| `queue` | `QueuePublisher` | `BullMqQueuePublisher` | one line |
| `vectors` | `VectorStore` | `PgVectorStore` | one line — pgvector → Qdrant |
| `analytics` | `AnalyticsReader` | `PgAnalyticsReader` | one line — Postgres → ClickHouse |
| `embeddings` | `EmbeddingProvider` | `OpenAiEmbeddingProvider` | one line |
| `sessions` | `SessionResolver` | `BetterAuthSessionResolver` | one line |
| `activity` | `ActivityLogger` | `PgActivityLogger` | one line |
| `unitOfWork` | `UnitOfWork` | `PgUnitOfWork` | one line |
| `content` | `ContentSource` | `StaticContentSource` | one line — static → CMS |
| `auth` | `AuthInstance` | Better Auth | rewrite `auth.factory.ts`, and nothing else |
| `capabilities` | `CapabilityCache` | — | concrete on purpose; it *is* the caching decision |
| `principals` | `PrincipalBuilder` | — | concrete on purpose; four credential types, one shape |

`database`, `redis`, `queuePublisher` and `transactions` are **private**. `dispose()` is what a
consumer gets instead, and `apps/worker` builds its own `RedisConnection` rather than reaching in.

The four rules that govern this class — abstract types on the public surface, no request state, no
`process.env`, reverse-order disposal — are in
[`docs/reference/container.md`](reference/container.md). The test shape that justifies all of it is
in [`docs/reference/test-container.md`](reference/test-container.md).

## Config arrives, it is never read

`ContainerConfig` is every value the system needs in one shape, and none of it comes from the
environment. `apps/web/src/env.ts` and `apps/worker/src/env.ts` are the only two files in the
repository that touch `process.env`; they parse it, validate it, and hand this object down.

```bash
grep -rn "process\.env" packages --include=*.ts | grep -vE "\.config\.ts|src/(migrate|seed|smoke|tables)/"
```

Returns nothing. No package reads its own configuration — Biome's `noProcessEnv`
([05](../../../docs/setup/05-lint-and-format.md)) is what keeps it true.

That is what lets you construct the entire system in a test with a fake database and a frozen clock,
and what lets the same code run in a web server and a background worker without either fighting over
environment variables.

## Three things this package does not have yet

**No use-cases.** The container has no feature fields, because no feature slice exists. They arrive
as eagerly-constructed `public readonly` fields, grouped by slice — the shape is in
[`reference/container.md`](reference/container.md).

**`content` takes no catalog.** `new StaticContentSource()` defaults to `CLIENT_CATALOG`.
`SERVER_CATALOG` and the `email` namespace arrive with
[20](../../../docs/setup/20-content-package.md); until then a server catalog would be a copy of the
client one, and the line becomes `new StaticContentSource(SERVER_CATALOG)`.

**`EventBus` has no implementation, so `Container` wires fourteen of the fifteen ports.** `application`
declares it for cross-slice side effects — a finance use-case publishes `invoice.approved` rather
than importing the notification slice — and nothing publishes one yet. It has no adapter in `db` or
`infrastructure` and no field here. `RecordingEventBus` exists anyway, so the first use-case that
does publish is testable the day it is written. **This is a gap in the setup docs**, not a decision:
[12](../../../docs/setup/12-application-package.md) says the barrel lists "every port the composition
root must supply an implementation for", and [17](../../../docs/setup/17-composition-container.md)'s
`Container` omits this one.

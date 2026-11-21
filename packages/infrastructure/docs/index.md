---
title: "@loadbearing/infrastructure"
description: Every concrete adapter the system owns, behind a port and confined to one package — Postgres and its schema, Redis, S3, BullMQ and OpenAI.
---

# `@loadbearing/infrastructure`

Owns `drizzle-orm`, `pg`, `ioredis`, `@aws-sdk/*` and `bullmq` so nothing else does; each class implements
an [`application`](../../application/docs/index.md) port and `Container` picks which to build. A grep for
those imports outside this package returns nothing.

| | |
| --- | --- |
| **Package** | `@loadbearing/infrastructure` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application` (the ports), `contracts`, `core`, `errors`, `permissions`, plus `drizzle-orm`, `pg`, `ioredis`, `bullmq`, `@aws-sdk/*` |
| **Used by** | `auth`, `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |

```
packages/infrastructure/
├── drizzle.config.ts                      ← build-time artefacts, above src/
├── migrate.ts                             ← the migration runner
├── seed.ts                                ← system roles, idempotent
├── smoke.ts                               ← the wiring check, run against live containers
└── src/
    ├── index.ts
    ├── import.ts                          ← every external symbol, vendor SDKs included
    ├── pg/                                Postgres — the biggest tenant
    │   ├── primitive/   database.ts        → Database, DrizzleClient
    │   │                base.repository.ts → BaseRepository
    │   ├── schema/      *.schema.ts       ← drizzle tables + the barrel drizzle-kit reads
    │   ├── repository/  pg-*.ts           → every adapter, one file each, flat
    │   ├── transaction/ pg-unit-of-work.ts → PgUnitOfWork, TransactionScope
    │   └── seed/        system-role.seed.ts → SystemRoleSeed
    ├── clickhouse/ clickhouse.connection.ts          → ClickHouseConnection
    │               clickhouse-analytics.reader.ts    → ClickHouseAnalyticsReader
    │               clickhouse-analytics.projector.ts → ClickHouseAnalyticsProjector
    ├── loki/      loki-log.reader.ts       → LokiLogReader
    ├── redis/     redis.connection.ts      → RedisConnection, RedisConfig
    │              redis-cache.store.ts     → RedisCacheStore
    ├── s3/        s3-storage.gateway.ts    → S3StorageGateway, S3Config
    │              storage-key.ts           → StorageKey
    ├── bullmq/    bullmq-queue.publisher.ts → BullMqQueuePublisher
    │              queue-name.ts            → QueueName
    ├── smtp/      smtp-email.sender.ts     → SmtpEmailSender
    ├── web-push/  web-push.sender.ts       → WebPushSender
    ├── crypto/    aes-gcm-secret.cipher.ts → AesGcmSecretCipher
    ├── unified/   unified-markdown.renderer.ts → UnifiedMarkdownRenderer
    ├── canned/    canned-assistant.model.ts → CannedAssistantModel
    ├── gemini/    gemini-embedding.provider.ts → GeminiEmbeddingProvider
    │              gemini-assistant.model.ts → GeminiAssistantModel
    ├── sse/       server-sent-event.reader.ts → ServerSentEventReader
    │              server-sent-event.request.ts → ServerSentEventRequest
    │              stream-watch.ts          → StreamWatch
    └── openai/    openai-embedding.provider.ts → OpenAiEmbeddingProvider
                   openai-assistant.model.ts → OpenAiAssistantModel
```

**Runnable scripts sit above `src/`** — inside a folder, the barrel runs them on import (why `seed.ts`
left `src/pg/seed/`, which keeps the class).

**One folder per external system**, so `ls src/` lists the dependencies, and filenames lead with the
technology ([Files](../../../docs/opinions/files.md)). **The system is the only subject:** the five
one-file `pg/repository/` subfolders were flattened — one-file folders are paths
([Simplicity](../../../docs/opinions/simplicity.md)), and two implementations of one port should read as
`pg-…` beside `clickhouse-…`. `pg/schema/` bends the rule because drizzle-kit needs one barrel of every
table.

**A folder means the seam exists, not that the service runs** — `clickhouse/` and `loki/` are built only
when configured ([swap points](#the-swap-points-and-what-makes-them-real)).

## What belongs here and what only looks like it does

| Store | Adapter here? | Why |
| --- | --- | --- |
| Redis | **yes** | `CacheStore`, and the connection BullMQ needs |
| S3 / MinIO | **yes** | `StorageGateway` |
| BullMQ | **yes** | `QueuePublisher`. Consumers live in `apps/worker` |
| OpenAI | **yes** | `EmbeddingProvider` |
| Postgres | **yes** | `drizzle-orm` + `pg` behind seven ports, plus the schema and migrations |
| ClickHouse | **yes** | `AnalyticsReader` *and* `AnalyticsProjector` |
| Loki | **yes, read side only** | `LogReader`. Nothing here writes to it |
| Alloy | **nowhere** | A separate process that tails stdout. No client, no port, nothing to import |

**The last two rows are the ones worth understanding, and they are two different answers.**

`JsonLogger` writes stdout and has never heard of Loki (Alloy tails it), so the log platform swap is
config. `LokiLogReader` reads back for the operator surface that knows organizations.

**ClickHouse's two adapters are the guard:** the request-reachable `ClickHouseAnalyticsReader` (behind
`GetActivityTrendUseCase`) and the worker-only `ClickHouseAnalyticsProjector` — one class would put
`project()` on a dashboard's object, and "only the consumer writes" keeps the store rebuildable. Both need
`analytics.clickhouse`; both are smoke-checked.

## The swap points, and what makes them real

Chosen by configuration, not a `new` — adopting a store is an environment variable and one `case`.

| Port | `driver` | Today | Next | Trigger |
| --- | --- | --- | --- | --- |
| `VectorStore` | `VECTOR_DRIVER` | `pgvector` | a dedicated vector database | pgvector recall or latency degrades |
| `LogReader` | `LOKI_URL` set or not | Loki | anything with a range-query API | search latency during a real incident |

**A discriminated `driver` is what makes "swap it" real** — a one-implementation seam is untested, and
`buildVectorStore`'s exhaustive `switch` fails the build on an unhandled driver. Analytics has no read
driver: `CLICKHOUSE_URL` builds both projector and reader (`null` without). `CLICKHOUSE_URL` makes
`CLICKHOUSE_DATABASE` and `CLICKHOUSE_USER` required (their `default` defaults cannot reach compose's
`ratchet`), and the scripts above `src/` (`clickhouse-migrate.ts`, `vitest.smoke.config.ts`) throw on
absent names rather than guess. **The vector swap is cheap because `search()` takes the resolved goal
scope** — a remote store cannot join back to permissions.

## Two Redis instances, one class

Two URLs, two clients — a correctness boundary, not tuning:

| | `client()` | `queueClient()` |
| --- | --- | --- |
| Instance | cache — `allkeys-lru` | queue — `noeviction` + AOF |
| Key prefix | `app:` | **none** — BullMQ manages its own keys |
| `maxRetriesPerRequest` | default | **`null`**, or blocking commands die |
| Losing a key | a slow minute | **work that never happens** |

**The role picks the connection** — two bare `Redis` arguments of one type would swap silently.
`maxRetriesPerRequest: null` is required (else blocking commands die and workers stop silently). **One
memoised client per role**; `healthy(role)` pings the one in use, keeping `ioredis` out of
[`composition`](../../composition/docs/reference/container.md).

## The `keyPrefix` asymmetry, in both directions

ioredis prefixes key arguments but **not** `SCAN`, so `deletePrefix` handles both directions:

```ts
const keyPrefix = this.redis.options.keyPrefix ?? "";
const pattern = `${keyPrefix}${prefix}*`;                       // MATCH needs it added
...
await this.redis.unlink(...keys.map((k) => k.slice(keyPrefix.length)));   // and stripped back off
```

**Missing the strip is silent** — double-prefixed `UNLINK` deletes nothing without error, so the smoke
check reads back after pruning. `deletePrefix` is capability invalidation: a broken prune keeps revoked
permissions.

## Other decisions worth knowing

- **A corrupt cache entry is a logged miss** (`cache.entry.corrupt`), not a throw — post-deploy DTO
  changes become latency, not an outage, and stay visible.
- **`SCAN` + `UNLINK`, never `KEYS` + `DEL`** — `KEYS` blocks the server.
- **Storage keys hold no filename** (`<subject>/<yyyy>/<mm>/<uuid>.<ext>`) — traversal, unicode and length
  in one; the display name lives in the row.
- **`removeOnComplete`/`removeOnFail` are mandatory** — forever-kept jobs fill a `noeviction` instance.
  So recovery reconciles against Postgres, making handler idempotency a requirement.

## The smoke check

```bash
pnpm --filter @loadbearing/infrastructure run smoke
```

Against live containers (an adapter tested against a fake tests the fake): cache round trip, prune and
read-back, S3 round trip with checksum, presign, delete and confirm, publish a job. Opt-in stores are
checked when configured, else skipped with a line:

- **ClickHouse** — the same probe row inserted **twice**, counted with `FINAL` as `1`: projection
  idempotency rests on `ReplacingMergeTree`, and a `MergeTree` typo would double numbers silently.
- **Loki** — `/ready` plus a real `query_range` over the last hour, asserting no particular line (that
  would be flaky).

It reads the root `.env` explicitly — under a pnpm filter, bare `dotenv/config` finds nothing.

## Reference

- [`PgUnitOfWork`](reference/unit-of-work.md) — the transaction scope, and what enrolling a
  repository in one actually means.
- [Enrollers, the founder, and the claimer](reference/enrollers.md) — the advisory locks, the races
  they protect against, and why every one of them binds structurally.
- [Assistant models](reference/assistant.md) — OpenAI, OpenRouter, Gemini and the canned fake behind
  `AssistantModel`: the stream, the two timeouts, and what a failure is
- [Embedding](reference/embedding.md) — `none`, `openai` or `gemini`, lexical search, what a provider
  switch does to the corpus, and `pnpm ai:reindex --adopt` for an upgrade
- [pgvector](reference/pgvector.md) — the permission filter on the input set, the score floor, and
  the `ORDER BY` that stops the index being used.
- [Partitions](reference/partitions.md) — the allowlist as the whole policy, the two mechanics that
  are not optional, and which reads prune to one month and which read every one.
- [Sharding](reference/sharding.md) — one key, one node, three placements; why `this.db` stays
  synchronous, and the tripwire that makes one Postgres reveal what a split would break.
- [Notification recipients](reference/notification-recipients.md) — four audiences, the
  correlated `EXISTS` that keeps one a single statement, and the one read that is two on purpose.
- [Cold storage](reference/cold-storage.md) — the tenant-month as the unit, the `cold/` prefix,
  `partition_archive` as the index a read starts from, and the restore that proves the difference.
- [The bucket's lifecycle policy](reference/storage-policy.md) — why a second gateway, why "no
  configuration" is an error code, and why the app owns the whole configuration rather than a rule.
- [ClickHouse](reference/clickhouse.md) — no client library, two adapters, and the order it is
  adopted in.
- [Loki](reference/loki.md) — why only a reader exists, and the query shapes the port refuses to
  offer.
- [Realtime](reference/realtime.md) — one subscriber connection per process, ref-counted channels,
  and why the overflow is a `resync`.
- [Fan-out](reference/fan-out.md) — the three §6 paths measured, and what a `users` delete did to a
  partitioned table.
- [The doc renderer](reference/doc-renderer.md) — the unified pipeline and why the sanitiser sits
  where it does, what it lets through, and the type stub that keeps the DOM out of this package.

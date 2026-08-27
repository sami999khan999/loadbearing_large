---
title: "@loadbearing/infrastructure"
description: Every concrete adapter the system owns, behind a port and confined to one package — Postgres and its schema, Redis, S3, BullMQ and OpenAI.
---

# `@loadbearing/infrastructure`

The package that owns `drizzle-orm`, `pg`, `ioredis`, `@aws-sdk/*` and `bullmq`, so nothing else has
to. Each class implements a port from [`@loadbearing/application`](../../application/docs/index.md),
and the `Container` decides which one to build.

```bash
grep -rn "drizzle-orm\|ioredis\|@aws-sdk\|bullmq\|from \"pg\"" packages --include=*.ts   | grep -v "packages/infrastructure"
```

Returns nothing. Every one of them appears in exactly one package, which is the whole claim.

**`packages/infrastructure` used to be separate and was folded in here.** The two were siblings with no edge
between them, and the split put one seam in two places — `PgAnalyticsReader` on the Postgres side,
`ClickHouseAnalyticsReader` on this one. Merging in this direction rather than the other keeps the
name honest: an S3 client in a package called `db` would be a lie, but Postgres genuinely is
infrastructure.

| | |
| --- | --- |
| **Package** | `@loadbearing/infrastructure` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application` (the ports), `contracts`, `core`, `errors`, `permissions`, plus `drizzle-orm`, `pg`, `ioredis`, `bullmq`, `@aws-sdk/*` |
| **Used by** | `auth`, `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |

```
packages/infrastructure/src/
├── index.ts
├── import.ts                          ← every external symbol, vendor SDKs included
├── pg/                                Postgres — the biggest tenant
│   ├── primitive/   database.ts       → Database, DrizzleClient
│   │                base.repository.ts → BaseRepository
│   ├── schema/      *.schema.ts       ← drizzle tables + the barrel drizzle-kit reads
│   ├── activity/    pg-activity.logger.ts   → PgActivityLogger
│   ├── analytics/   pg-analytics.reader.ts  → PgAnalyticsReader
│   ├── rbac/        pg-*.repository.ts      → PgApiKeyRepository, PgCapabilityRepository
│   │                pg-membership.reader.ts → PgMembershipReader
│   ├── transaction/ pg-unit-of-work.ts      → PgUnitOfWork, TransactionScope
│   ├── vector/      pg-vector.store.ts      → PgVectorStore
│   ├── migrate/     index.ts                ← the migration runner
│   └── seed/        index.ts                ← system roles, idempotent
├── redis/     redis.connection.ts     → RedisConnection, RedisConfig
│              redis.cache-store.ts    → RedisCacheStore
├── s3/        s3-storage.gateway.ts   → S3StorageGateway, S3Config
│              storage-key.ts          → StorageKey
├── bullmq/    bullmq.queue-publisher.ts → BullMqQueuePublisher
│              queue-name.ts           → QueueName
├── openai/    openai.embedding-provider.ts → OpenAiEmbeddingProvider
└── smoke/     index.ts                ← the wiring check, run against live containers
```

**One folder per external system**, so `ls src/` answers "what does this package depend on?" in one
line. The filenames already led with the technology ([Files](../../../docs/opinions/files.md) — *"you
should be able to see what you would delete"*); the folders now agree with them, which makes each one
a subject folder in the sense [Folders](../../../docs/opinions/folders.md) means.

`smoke/` is the only folder that is not a system: it spans Redis, S3 and BullMQ at once. And
`pg/schema/` is the one place the subject rule bends — drizzle-kit needs a single barrel naming every
table, so the tables sit together rather than beside the repositories that read them.

## What belongs here and what only looks like it does

| Store | Adapter here? | Why |
| --- | --- | --- |
| Redis | **yes** | `CacheStore`, and the connection BullMQ needs |
| S3 / MinIO | **yes** | `StorageGateway` |
| BullMQ | **yes** | `QueuePublisher`. Consumers live in `apps/worker` |
| OpenAI | **yes** | `EmbeddingProvider` |
| Postgres | **yes** | `drizzle-orm` + `pg` behind six ports, plus the schema and migrations |
| ClickHouse | **here, when adopted** | `AnalyticsReader`, same shape as the rest |
| Loki, Alloy | **nowhere** | No client, no port, nothing to import |

**The last row is the one worth understanding.** `JsonLogger` writes structured JSON to stdout and has
never heard of Loki; Alloy is a separate process that tails it. There is no library to install and no
seam to implement, which is exactly what makes swapping the log platform a config change.

## Two Redis instances, one class

`RedisConnection` takes two URLs and hands out two clients, and that is a correctness boundary rather
than tuning.

| | `client()` | `queueClient()` |
| --- | --- | --- |
| Instance | cache — `allkeys-lru` | queue — `noeviction` + AOF |
| Key prefix | `ratchet:` | **none** — BullMQ manages its own keys |
| `maxRetriesPerRequest` | default | **`null`**, or blocking commands die |
| Losing a key | a slow minute | **work that never happens** |

**Which connection a consumer gets is a property of what it is doing**, not a wiring decision. Passing
two bare `Redis` instances into `Container` puts that choice at a call site where both arguments have
the same type and swapping them compiles.

`maxRetriesPerRequest: null` is not optional. BullMQ's blocking commands sit open indefinitely and
ioredis's default retry limit kills them — the symptom is workers that stop consuming after a few
minutes, with no error.

**One client per role, memoised.** `client()` called twice used to be two TCP connections, and the
second one is invisible until the connection count is the symptom. `healthy(role)` then pings the
connection the cache store and the queue publisher are *already* using — opening a fresh one to
answer a health check reports green on a socket nothing else has.

`healthy` takes the role rather than handing out a `Redis`, which is what lets
[`Container.healthy()`](../../composition/docs/reference/container.md) check both instances without
`ioredis` ever appearing in `packages/composition`.

## The `keyPrefix` asymmetry, in both directions

ioredis applies `keyPrefix` to key arguments but **not** to `SCAN`. That cuts both ways, and
`deletePrefix` has to handle each:

```ts
const keyPrefix = this.redis.options.keyPrefix ?? "";
const pattern = `${keyPrefix}${prefix}*`;                       // MATCH needs it added
...
await this.redis.unlink(...keys.map((k) => k.slice(keyPrefix.length)));   // and stripped back off
```

**Missing the second half is silent.** `SCAN` returns fully-prefixed keys; handing those straight to
`unlink` prefixes them a second time and deletes nothing, and `UNLINK` on a missing key is not an
error. The smoke check asserts a read-back *after* the prune for exactly this reason — the version
without that line printed a clean run while deleting nothing.

It matters because `deletePrefix` is how capability invalidation works. A silently broken prune means
a user keeps permissions after their role changed.

## Other decisions worth knowing

**A corrupt cache entry is a miss, not a throw.** Deserialisation failures happen after a deploy that
changed a DTO shape. Throwing turns a stale cache into an outage; evicting and falling through turns
it into a latency bump.

**`SCAN` + `UNLINK`, never `KEYS` + `DEL`.** `KEYS` is O(n) over the whole keyspace and blocks the
server while it runs; `UNLINK` frees memory off the main thread.

**Storage keys never contain a filename.** `<subject>/<yyyy>/<mm>/<uuid>.<ext>` — path traversal,
unicode collisions and length limits are three live problems a UUID solves at once. The display name
belongs in the database row.

**`removeOnComplete` and `removeOnFail` are mandatory.** BullMQ keeps completed jobs forever by
default; ten jobs a second is about a million records a day, and on a `noeviction` instance that ends
with everything stopping.

That retention is also why the recovery sweep cannot ask BullMQ what it missed — an hour after a
success the evidence is gone. It reconciles against Postgres instead, which is what makes handler
idempotency a requirement rather than a nicety.

## The smoke check

```bash
pnpm --filter @loadbearing/infrastructure run smoke
```

Not a unit test — these are adapters, and testing an adapter against a fake tests the fake. It
round-trips the cache, prunes it and reads back, round-trips an object through S3 with a checksum,
presigns a URL, deletes and confirms absence, then publishes a job. Against the running containers,
with no errors.

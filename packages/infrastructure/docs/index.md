---
title: "@loadbearing/infrastructure"
description: Every vendor SDK the system speaks to, behind a port and confined to one package. Redis, S3, BullMQ and OpenAI — five adapters and their config types.
---

# `@loadbearing/infrastructure`

The package that owns `ioredis`, `@aws-sdk/*` and `bullmq`, so nothing else has to. Each class
implements a port from [`@loadbearing/application`](../../application/docs/index.md), and the
`Container` decides which one to build.

```bash
grep -rn "ioredis\|@aws-sdk\|bullmq" packages --include=*.ts | grep -v "packages/infrastructure"
```

Returns nothing. Those three appear in exactly one package, which is the whole claim.

| | |
| --- | --- |
| **Package** | `@loadbearing/infrastructure` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application` (the ports), `core`, `errors`, plus `ioredis`, `bullmq`, `@aws-sdk/*` |
| **Used by** | `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |

```
packages/infrastructure/src/
├── index.ts
├── import.ts                          ← every external symbol, vendor SDKs included
├── redis/     redis.connection.ts     → RedisConnection, RedisConfig
├── cache/     redis.cache-store.ts    → RedisCacheStore
├── storage/   s3-storage.gateway.ts   → S3StorageGateway, S3Config
│              storage-key.ts          → StorageKey
├── queue/     bullmq.queue-publisher.ts → BullMqQueuePublisher
│              queue-name.ts           → QueueName
├── embedding/ openai.embedding-provider.ts → OpenAiEmbeddingProvider
└── smoke/     index.ts                ← the wiring check, run against live containers
```

One folder per seam, each holding its adapter — the same shape
[`@loadbearing/db`](../../db/docs/index.md) uses. A seam folder holding one file is normal.

## What belongs here and what only looks like it does

| Store | Adapter here? | Why |
| --- | --- | --- |
| Redis | **yes** | `CacheStore`, and the connection BullMQ needs |
| S3 / MinIO | **yes** | `StorageGateway` |
| BullMQ | **yes** | `QueuePublisher`. Consumers live in `apps/worker` |
| OpenAI | **yes** | `EmbeddingProvider` |
| ClickHouse | **here, when adopted** | `AnalyticsReader`, same shape as the rest |
| Postgres | `packages/db` | It has a whole package, because `db` means Postgres |
| Loki, Alloy, Grafana | **nowhere** | No client, no port, nothing to import |

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

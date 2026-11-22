---
title: redis
description: Two instances with opposite durability guarantees, every flag explained, and why one container was the wrong answer.
---

# `redis-cache` and `redis-queue`

The same image twice, configured as opposites — the most-questioned pair in the stack.

| | `redis-cache` | `redis-queue` |
| --- | --- | --- |
| **Inside the network** | `redis-cache:6379` | `redis-queue:6379` |
| **From the host** | `localhost:16379` | `localhost:16380` |
| **Eviction** | `allkeys-lru` | `noeviction` |
| **Persistence** | none | AOF |
| **Volume** | none | `redisqueuedata` |
| **Holds** | capability cache, session cache | BullMQ jobs |
| **If flushed** | a slow minute | **lost work** |

**Both listen on 6379 inside** — separate containers, only host mappings differ; `redis-queue:6380`
inside the network refuses.

---

## Why two

**Cache and sessions are cache-aside:** `CapabilityCache` reads through to `PgCapabilityRepository`,
Better Auth's secondary storage to the Postgres `session` table — losing either costs latency.
**A BullMQ job is derived from nothing:** requested work with no table to rebuild it from (the
[derived-store test](../../opinions/data-and-scale.md)). One instance forces one policy on both:
`allkeys-lru` silently deletes queued jobs under memory pressure; `noeviction` makes a full cache error
on a path that should degrade. **No correct single answer means two concerns in one container.**

---

## The flags

```yaml
redis-cache:
  command: ["redis-server", "--save", "", "--maxmemory-policy", "allkeys-lru"]
```

- **`--save ""`** disables RDB snapshots (omitting the flag keeps the image's periodic defaults) — no
  I/O on data worthless once stale.
- **`--maxmemory-policy allkeys-lru`** evicts the least-recently-used key of *any* kind; `volatile-lru`
  only considers TTL'd keys, so one written without a TTL would be immortal and the instance would fill.

```yaml
redis-queue:
  command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
```

- **`--appendonly yes`** journals every write, so a crash loses at most the last fsync window — what
  makes the volume meaningful.
- **`--maxmemory-policy noeviction`** errors when memory is full instead of deleting. A failed
  `enqueue` is a failed request; a silently evicted job is a customer asking why nothing happened.

**So both job sets are capped:** completed jobs kept an hour, max 1,000 per queue; failed jobs a week,
max 10,000. The failed set is the dead letter (`pnpm queue:replay <queue>` re-queues it), and the cap
stops a day-long failure storm filling a `noeviction` instance that would then refuse every enqueue.
Likewise an embedding job carries its text's bucket key, never the text (up to 100 KB).

> **AOF covers a crash, not `FLUSHALL`.** Hence a nightly sweep re-enqueueing unprocessed work,
> reconciled against Postgres rather than BullMQ job records, which age out in an hour.

---

## How the application picks one

`RedisConnection` takes the URLs and hands out the right client per job:

```ts
redis.client()           // cacheUrl    — prefixed, for RedisCacheStore
redis.queueClient()      // queueUrl    — maxRetriesPerRequest: null, for BullMQ
redis.realtimeClient()   // realtimeUrl — live frames; the cache client itself when unset
redis.subscriberClient() // realtimeUrl — subscriber mode, opened by the first stream
```

**One class, several URLs**, so the connection follows what a consumer does — two bare `Redis`
arguments to `Container` have the same type, and swapping them compiles.

- **`maxRetriesPerRequest: null` on the queue client** — BullMQ's blocking commands stay open, and
  ioredis's default retry limit kills them: workers stop consuming after minutes, with no error.
- **A key prefix on the cache client, none on the queue client** — ioredis prepends it transparently,
  right for cache keys and breaking for BullMQ, which manages its own key structure.

> **Everything through `CacheStore` is on the evicting instance**, Better Auth's secondary storage
> included — which is why sessions stay in Postgres. An evicted session is a miss, never a sign-out.

### A third instance for live frames

`REDIS_REALTIME_URL` is optional; unset or equal to `REDIS_CACHE_URL`, `realtimeClient()` **is** the
cache client. Set it apart once large-room fan-out competes with sign-in reads — one message to a
25,000-member room is 25,000 publishes. Pub/sub keeps nothing (no persistence or eviction policy
needed), but watch `client-output-buffer-limit pubsub`: a lagging subscriber is **disconnected** at the
limit, ending and resyncing every stream on that process at once.

---

## Checking it

```bash
C="docker compose -f infra/docker-compose.yml"
$C exec redis-cache redis-cli config get maxmemory-policy   # allkeys-lru
$C exec redis-queue redis-cli config get maxmemory-policy   # noeviction
$C exec redis-queue redis-cli config get appendonly         # yes
$C exec redis-cache redis-cli config get save               # (empty)
```

```bash
# safe by construction — everything on the cache reads through to Postgres
docker compose -f infra/docker-compose.yml exec redis-cache redis-cli flushall
```

The same against `redis-queue` deletes work. The split lets you clear one without the other; form the
habit locally, where it costs nothing.

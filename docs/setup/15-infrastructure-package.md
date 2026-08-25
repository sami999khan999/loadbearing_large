# 15 · `@loadbearing/infrastructure`

> The non-Postgres adapters: Redis caching, S3 file storage, and the BullMQ queue publisher. Server-only.

**Delivers:** `RedisCacheStore`, `S3StorageGateway`, `BullMqQueuePublisher`, `RedisConnection`, and the embedding provider from [14](14-vector-store.md).

**Prerequisite:** [14 · Vector Storage](14-vector-store.md)

---

## Why this package exists

This is a departure from the architecture docs, flagged in [00](00-README.md). The docs place concrete adapters in `db` "or in the app that constructs them." Neither works here:

- **`db` means Postgres.** An S3 client and a Redis connection inside a package called `db` makes the name a lie, and the next person adds a Kafka producer there too.
- **`apps/` means duplication.** `apps/web` and `apps/worker` both need S3 and Redis. Constructing them in each app means two copies of the retry policy, the key layout, and the presign expiry — which will drift.

So non-Postgres adapters get one server-only package, exactly the way `auth` got one. The dependency direction is identical to `db`: it implements ports declared in `application`, and `application` never imports it.

**If you would rather stay at thirteen packages,** fold `src/cache/`, `src/storage/`, and `src/queue/` into `packages/db/src/` as siblings of `vector/`. Every other line in these documents is unchanged.

```
packages/infrastructure/src/
├── index.ts                          ← ServerOnly.assert()
├── redis/
│   ├── index.ts
│   └── redis.connection.ts           → RedisConnection
├── cache/
│   ├── index.ts
│   └── redis.cache-store.ts          → RedisCacheStore
├── storage/
│   ├── index.ts
│   ├── s3-storage.gateway.ts         → S3StorageGateway
│   └── storage-key.ts                → StorageKey
├── queue/
│   ├── index.ts
│   ├── queue-name.ts                 → QueueName
│   └── bullmq.queue-publisher.ts     → BullMqQueuePublisher
└── embedding/
    ├── index.ts
    └── openai.embedding-provider.ts  → OpenAiEmbeddingProvider
```

**`packages/infrastructure/src/index.ts`**

```ts
import { ServerOnly } from "@loadbearing/core";

ServerOnly.assert("@loadbearing/infrastructure");

export { RedisCacheStore } from "./cache/index.js";
export { type OpenAiEmbeddingConfig, OpenAiEmbeddingProvider } from "./embedding/index.js";
export { BullMqQueuePublisher, QueueName } from "./queue/index.js";
export { type RedisConfig, RedisConnection } from "./redis/index.js";
export { type S3Config, S3StorageGateway, StorageKey } from "./storage/index.js";
```

Read that list against `container.ts` ([17](17-composition-container.md)) and every name lines up with one `port` binding. That is the whole public surface of the package — five adapters and their config types.

---

## Step 15.1 — `RedisConnection`

Redis is doing three jobs — cache, session secondary store, and BullMQ backing store — and they do not have the same durability requirements. **Two instances, and one class owns which is which.**

**`packages/infrastructure/src/redis/redis.connection.ts`**

```ts
import { Redis, type RedisOptions } from "ioredis";

export interface RedisConfig {
  // Evicts under pressure. Everything on it rebuilds from Postgres.
  readonly cacheUrl: string;
  // Never evicts. A queued job is derived from nothing.
  readonly queueUrl: string;
  readonly keyPrefix?: string;
}

export class RedisConnection {
  private readonly clients = new Set<Redis>();

  constructor(private readonly config: RedisConfig) {}

  // Cache and session reads. Prefixed, and safe to share.
  public client(): Redis {
    return this.create(this.config.cacheUrl, {
      keyPrefix: this.config.keyPrefix ?? "ratchet:",
    });
  }

  // BullMQ requires `maxRetriesPerRequest: null` and its own key namespace.
  // Sharing a prefixed client with the cache corrupts queue keys.
  public queueClient(): Redis {
    return this.create(this.config.queueUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  private create(url: string, options: RedisOptions): Redis {
    const redis = new Redis(url, {
      lazyConnect: false,
      enableAutoPipelining: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
      ...options,
    });
    this.clients.add(redis);
    return redis;
  }

  public async close(): Promise<void> {
    await Promise.all([...this.clients].map((c) => c.quit()));
    this.clients.clear();
  }
}
```

**`maxRetriesPerRequest: null` for the queue client is not optional** — BullMQ's blocking commands sit open indefinitely, and ioredis's default retry limit kills them. The symptom is workers that stop consuming after a few minutes with no error, which is a genuinely unpleasant thing to debug.

**`keyPrefix` on the cache client, none on the queue client.** ioredis prepends the prefix to every key transparently, which is exactly what you want for cache keys and exactly what breaks BullMQ, whose key structure it manages itself.

**`enableAutoPipelining: true`** batches commands issued in the same tick into one round trip. On the capability-cache path — several `get` calls while building a principal — that is a real latency saving for one line.

**Two URLs, not one, in every environment.** The cache instance runs `allkeys-lru`; the queue instance runs `noeviction` with AOF. Locally they are two containers ([11](11-local-infrastructure.md)), because a split that exists only in production is a code path first exercised on deployment day.

The reason it is one class taking two URLs rather than two classes: **which connection a consumer gets should be a property of what it is doing, not a wiring decision made in the container.** `RedisCacheStore` asks for `client()`, `BullMqQueuePublisher` asks for `queueClient()`, and neither can accidentally receive the other. Passing two bare `Redis` instances into `Container` puts that choice at a call site where the two arguments have the same type and swapping them compiles.

> **This is a correctness boundary, not tuning.** Anything reached through `client()` can vanish under memory pressure — so it must be a cache in front of a durable store, never the store. Better Auth's secondary storage sits on this connection ([16](16-auth-package.md)), which is exactly why sessions stay in Postgres and Redis is only a read-through in front of them.

---

## Step 15.2 — `RedisCacheStore`

**`packages/infrastructure/src/cache/redis.cache-store.ts`**

```ts
import type { Redis } from "ioredis";
import { CacheStore } from "@loadbearing/application";

export class RedisCacheStore extends CacheStore {
  constructor(private readonly redis: Redis) {
    super();
  }

  public override async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupt entry is a cache miss, never an error. Evict and move on.
      await this.redis.del(key);
      return null;
    }
  }

  public override async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  public override async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // SCAN, never KEYS — KEYS blocks the server for the duration of the scan.
  public override async deletePrefix(prefix: string): Promise<void> {
    const pattern = `${this.redis.options.keyPrefix ?? ""}${prefix}*`;
    let cursor = "0";

    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await this.redis.unlink(...keys);
    } while (cursor !== "0");
  }
}
```

### Three things worth knowing

**A corrupt entry is a miss, not a throw.** Cache deserialisation failures happen after a deploy that changed a DTO shape. Throwing turns a stale cache into an outage; evicting and falling through turns it into a brief latency bump.

**`SCAN` with `UNLINK`, never `KEYS` with `DEL`.** `KEYS` is O(n) over the entire keyspace and blocks Redis while it runs — on a production instance that is a multi-second stall for every other consumer. `UNLINK` frees memory on a background thread rather than inline.

**The prefix has to be re-added manually in `deletePrefix`.** ioredis's `keyPrefix` applies to key arguments but not to `SCAN`'s `MATCH` pattern. This asymmetry is a genuine footgun and the reason the line looks redundant.

### Key naming

```
<subject>:<identifier>[:<qualifier>]
```

`capability:user:<userId>`, `session:<sessionId>`, `content:message:en`. Colon-separated, and the **prefix must be prunable** — `deletePrefix("capability:user:")` has to mean something. That constraint is why the user ID goes last in the capability key rather than first.

---

## Step 15.3 — `S3StorageGateway`

**`packages/infrastructure/src/storage/storage-key.ts`**

```ts
import { Uuid } from "@loadbearing/core";

export class StorageKey {
  private constructor() {}

  // `<subject>/<yyyy>/<mm>/<uuid>.<ext>` — date-partitioned, never user input.
  public static build(subject: string, originalFilename: string, at: Date): string {
    const year = at.getUTCFullYear();
    const month = String(at.getUTCMonth() + 1).padStart(2, "0");
    const extension = StorageKey.extensionOf(originalFilename);
    return `${subject}/${year}/${month}/${Uuid.v7()}${extension}`;
  }

  private static extensionOf(filename: string): string {
    const match = /\.([a-z0-9]{1,8})$/i.exec(filename);
    return match ? `.${match[1]!.toLowerCase()}` : "";
  }
}
```

**Never put a user-supplied filename in a key.** Path traversal, unicode normalisation collisions, and length limits are all live problems, and none of them are worth solving when a UUID solves all three. Keep the display name in the database row next to the key.

**Date-partitioned** because lifecycle rules, cost reports, and bulk deletes all work on prefixes. A flat bucket with a million objects is painful in a way that only becomes apparent when you need to delete last year's.

**`packages/infrastructure/src/storage/s3-storage.gateway.ts`**

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageGateway, type StoredObject } from "@loadbearing/application";

export interface S3Config {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  // true for MinIO, false for AWS.
  readonly forcePathStyle: boolean;
}

export class S3StorageGateway extends StorageGateway {
  private readonly s3: S3Client;

  constructor(private readonly config: S3Config) {
    super();
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }

  public override async put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<StoredObject> {
    const checksum = await S3StorageGateway.sha256(body);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ChecksumSHA256: Buffer.from(checksum, "hex").toString("base64"),
      }),
    );

    return { key, size: body.byteLength, contentType, checksum };
  }

  public override async get(key: string): Promise<Uint8Array> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`Object ${key} has no body.`);
    return new Uint8Array(await result.Body.transformToByteArray());
  }

  public override async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  public override async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  public override async presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  public override async presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  private static async sha256(body: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", body);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
```

### The upload flow

The gateway supports both, and which one a feature uses is a domain decision:

**Direct-to-S3 (default for user uploads).** The use-case authorizes, generates a key, returns a presigned PUT URL. The browser uploads straight to storage; the app server never sees the bytes. A second call confirms and writes the database row. This is what keeps a 50 MB receipt off your request path entirely.

**Through the server (for generated files).** A PDF the worker renders, an export the system builds. There is no browser involved and `put()` is the whole story.

**Never return a permanent public URL.** `presignDownload` with a short expiry — five minutes is generous — and the bucket stays private (`mc anonymous set none` in [11](11-local-infrastructure.md)). A public URL is a permanent, unauthenticated, unrevocable grant, and it will end up in a support ticket, then a shared inbox, then a search index.

**Expiry belongs to the caller, not the gateway.** A download link embedded in an email needs longer than one rendered in a live UI. Making it a parameter means that is a use-case decision rather than a config value someone raises to seven days for one feature.

**`ChecksumSHA256` on every put.** S3 verifies it server-side and rejects a corrupt transfer instead of silently storing truncated bytes. Storing the checksum on the returned `StoredObject` also gives deduplication and integrity checking for free later.

---

## Step 15.4 — `BullMqQueuePublisher`

**`packages/infrastructure/src/queue/queue-name.ts`**

```ts
export class QueueName {
  private constructor() {}

  public static readonly EMBEDDING = "embedding";
  public static readonly NOTIFICATION = "notification";
  public static readonly DOCUMENT = "document";
  public static readonly ANALYTICS = "analytics";
  public static readonly MAINTENANCE = "maintenance";

  public static readonly ALL = [
    QueueName.EMBEDDING,
    QueueName.NOTIFICATION,
    QueueName.DOCUMENT,
    QueueName.ANALYTICS,
    QueueName.MAINTENANCE,
  ] as const;
}
```

**A handful of queues by concern, not one per job type.** Queues are a concurrency and priority boundary: embedding is slow and rate-limited, notifications are fast and bursty, and you want to tune those separately. Fifty queues means fifty Redis connections and fifty things to monitor.

**`ANALYTICS` is its own concern because it is allowed to fall behind.** Projecting domain events into snapshot tables is the one workload here where lag is acceptable and throughput matters more than latency — nobody is waiting on a dashboard row. Sharing a queue with notifications would let a backlog of projections delay something a user is actually waiting for. It is also the queue whose depth is the health signal for the derived store: a consumer that died on Tuesday shows up here before it shows up in a wrong quarterly number ([Data and scale](../opinions/data-and-scale.md) §2).

**`packages/infrastructure/src/queue/bullmq.queue-publisher.ts`**

```ts
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { QueuePublisher, type JobOptions } from "@loadbearing/application";

export class BullMqQueuePublisher extends QueuePublisher {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: Redis) {
    super();
  }

  public override async publish<T>(
    queue: string,
    payload: T,
    options?: JobOptions,
  ): Promise<void> {
    await this.queueFor(queue).add(queue, payload, {
      delay: options?.delayMs,
      attempts: options?.attempts ?? 3,
      jobId: options?.jobId,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    });
  }

  private queueFor(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const created = new Queue(name, { connection: this.connection });
    this.queues.set(name, created);
    return created;
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}
```

**`removeOnComplete` and `removeOnFail` are mandatory, not tuning.** BullMQ keeps completed jobs forever by default. A queue processing ten jobs a second accumulates about a million records a day, and the first symptom is Redis running out of memory — which, with `noeviction`, means everything stops. Keeping an hour of successes and a day of failures gives you enough to debug with and a bounded footprint.

> **A consequence worth stating, because it decides how the recovery sweep is built.** These retention windows mean job history is *not* a durable record of what happened — an hour after a success, and a day after a failure, the evidence is gone. So the nightly sweep that re-enqueues unprocessed work cannot ask BullMQ what it missed; by the time it runs, there is nothing to ask.
>
> It reconciles against Postgres instead: *which domain rows should have been processed and have not been?* That query works whether the job was lost to a `FLUSHALL`, a crash between enqueue and persist, or a bug that dropped it silently — and it is the reason handlers must be idempotent, since a re-enqueued job may be a duplicate rather than a replacement ([25](25-worker-app.md)).

**`jobId` is the deduplication key**, and it comes from the port because idempotency is a domain rule. `jobId: "embed:receipt:<id>"` means enqueuing twice produces one job — which is exactly what you want when a retry re-publishes.

**Exponential backoff from the first attempt.** A downstream service that is down does not recover faster because you retried three times in two seconds.

**Consumers live in `apps/worker`, not here.** This package publishes. See [25](25-worker-app.md).

---

## Step 15.5 — Barrels

```ts
// packages/infrastructure/src/cache/index.ts
export { RedisCacheStore } from "./redis.cache-store.js";
```

```ts
// packages/infrastructure/src/storage/index.ts
export { type S3Config, S3StorageGateway } from "./s3-storage.gateway.js";
export { StorageKey } from "./storage-key.js";
```

```ts
// packages/infrastructure/src/queue/index.ts
export { BullMqQueuePublisher } from "./bullmq.queue-publisher.js";
export { QueueName } from "./queue-name.js";
```

```ts
// packages/infrastructure/src/redis/index.ts
export { type RedisConfig, RedisConnection } from "./redis.connection.js";
```

```ts
// packages/infrastructure/src/embedding/index.ts
export {
  type OpenAiEmbeddingConfig,
  OpenAiEmbeddingProvider,
} from "./openai.embedding-provider.js";
```

Folder barrels name their exports for the same reason root barrels do — and here it buys something concrete: a vendor adapter can keep its private helpers exported for a sibling file without those helpers becoming part of `@loadbearing/infrastructure`.

---

## Step 15.6 — A smoke test

Not a unit test — these classes are adapters and testing them against fakes tests nothing. Write one script that exercises all three against the running containers.

**`packages/infrastructure/src/smoke.ts`**

```ts
import "dotenv/config";
import { RedisCacheStore } from "./cache/index.js";
import { BullMqQueuePublisher, QueueName } from "./queue/index.js";
import { RedisConnection } from "./redis/index.js";
import { S3StorageGateway, StorageKey } from "./storage/index.js";

const redis = new RedisConnection({
  cacheUrl: process.env.REDIS_CACHE_URL!,
  queueUrl: process.env.REDIS_QUEUE_URL!,
});

const cache = new RedisCacheStore(redis.client());
await cache.set("smoke:probe", { ok: true }, 30);
console.log("cache:", await cache.get("smoke:probe"));
await cache.deletePrefix("smoke:");

const storage = new S3StorageGateway({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION!,
  bucket: process.env.S3_BUCKET!,
  accessKey: process.env.S3_ACCESS_KEY!,
  secretKey: process.env.S3_SECRET_KEY!,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
});

const key = StorageKey.build("smoke", "probe.txt", new Date());
await storage.put(key, new TextEncoder().encode("hello"), "text/plain");
console.log("storage:", new TextDecoder().decode(await storage.get(key)));
console.log("presigned:", (await storage.presignDownload(key, 60)).slice(0, 80), "…");
await storage.delete(key);

const publisher = new BullMqQueuePublisher(redis.queueClient());
await publisher.publish(QueueName.MAINTENANCE, { probe: true }, { jobId: "smoke-probe" });
console.log("queue: published");

await publisher.close();
await redis.close();
```

```bash
pnpm add --filter @loadbearing/infrastructure -D dotenv tsx@catalog:
pnpm --filter @loadbearing/infrastructure exec tsx src/smoke.ts
```

Delete `smoke.ts` once it has passed, or move it under a `scripts/` folder excluded from the build. It is a wiring check, not a test suite.

---

## ✅ Gate

The smoke script prints a cache round-trip, a storage round-trip, a presigned URL, and a published job — with no errors.

```bash
grep -rn "ioredis\|@aws-sdk\|bullmq" packages --include=*.ts | grep -v "packages/infrastructure"
```

Returns nothing. Those three dependencies appear in exactly one package.

Do not proceed until this passes.

---

[← Vector Storage](14-vector-store.md) · [`@loadbearing/auth` →](16-auth-package.md)

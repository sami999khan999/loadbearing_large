# 16 · `@ratchet/composition`

> The hand-written DI root that replaces a framework container. Roughly a hundred lines, no decorators, no reflection, no module graph.

**Delivers:** One `Container` class constructed identically by the web app and the worker.

**Prerequisite:** [15 · `@ratchet/auth`](15-auth-package.md)

---

## What this package is for

It is the only package that knows both the abstract ports and their concrete implementations, because wiring them together is its entire job. Every other package knows one side or the other.

That is also why it is the only place a swap happens. Moving from pgvector to Qdrant, from MinIO to S3, from Better Auth to something else — each is one line here, and nothing upstream notices.

```
packages/composition/src/
├── index.ts                ← ServerOnly.assert()
├── container.config.ts     → ContainerConfig
└── container.ts            → Container
```

```js
// packages/composition/eslint.config.js
export { default } from "@ratchet/eslint-config/oop";
```

---

## Step 16.1 — `ContainerConfig`

**`packages/composition/src/container.config.ts`**

```ts
export interface ContainerConfig {
  readonly database: {
    readonly url: string;
    readonly maxConnections?: number;
  };
  readonly redis: {
    readonly url: string;
    readonly queueUrl?: string;
  };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly forcePathStyle: boolean;
  };
  readonly auth: {
    readonly secret: string;
    readonly baseUrl: string;
    readonly trustedOrigins: readonly string[];
    readonly sessionMaxAgeSeconds: number;
    readonly cookieCacheMaxAgeSeconds: number;
    readonly requireEmailVerification: boolean;
  };
  readonly embedding: {
    readonly apiKey: string;
    readonly model: string;
    readonly dimensions: number;
  };
}
```

**Every value the system needs, in one shape, and none of it read from the environment.** `apps/web/src/env.ts` and `apps/worker/src/env.ts` are the only two files in the repository that touch `process.env`; they parse it, validate it, and hand this object down.

That is what lets you construct the entire system in a test with a fake database and a frozen clock — and it is what lets the same code run in a web server and a background worker without either fighting over environment variables. (The Tauri desktop app never constructs a `Container` at all — see [29](29-desktop-app.md).)

---

## Step 16.2 — `Container`

**`packages/composition/src/container.ts`**

```ts
import { ServerOnly, SystemClock, type Clock } from "@ratchet/core";
import {
  Authorizer,
  type CacheStore,
  type EmbeddingProvider,
  type QueuePublisher,
  type SessionResolver,
  type StorageGateway,
  type UnitOfWork,
  type VectorStore,
} from "@ratchet/application";
import {
  AuthFactory,
  BetterAuthSessionResolver,
  CapabilityCache,
  PrincipalBuilder,
  type AuthInstance,
} from "@ratchet/auth";
import { ContentSource, StaticContentSource } from "@ratchet/content";
import {
  Database,
  PgActivityLogger,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgUnitOfWork,
  PgVectorStore,
} from "@ratchet/db";
import {
  BullMqQueuePublisher,
  OpenAiEmbeddingProvider,
  RedisCacheStore,
  RedisConnection,
  S3StorageGateway,
} from "@ratchet/infrastructure";
import type { ContainerConfig } from "./container.config.js";

ServerOnly.assert("@ratchet/composition");

export class Container {
  // ── infrastructure, private ───────────────────────────────
  private readonly database: Database;
  private readonly redis: RedisConnection;
  private readonly queuePublisher: BullMqQueuePublisher;

  // ── shared primitives ─────────────────────────────────────
  public readonly clock: Clock;
  public readonly authorizer: Authorizer;

  // ── ports, exposed as their abstract types ────────────────
  public readonly cache: CacheStore;
  public readonly storage: StorageGateway;
  public readonly queue: QueuePublisher;
  public readonly vectors: VectorStore;
  public readonly embeddings: EmbeddingProvider;
  public readonly sessions: SessionResolver;
  public readonly unitOfWork: UnitOfWork;
  public readonly content: ContentSource;

  // ── auth ──────────────────────────────────────────────────
  public readonly auth: AuthInstance;
  public readonly capabilities: CapabilityCache;
  public readonly principals: PrincipalBuilder;

  // ── use-cases go here as features arrive ──────────────────
  // public readonly reactivateTask: ReactivateTaskUseCase;

  constructor(private readonly config: ContainerConfig) {
    this.database = new Database(config.database);
    this.redis = new RedisConnection({ url: config.redis.url });

    this.clock = new SystemClock();
    this.authorizer = new Authorizer();

    this.cache = new RedisCacheStore(this.redis.client());
    this.storage = new S3StorageGateway(config.storage);
    this.queuePublisher = new BullMqQueuePublisher(this.redis.queueClient());
    this.queue = this.queuePublisher;
    this.unitOfWork = new PgUnitOfWork(this.database);

    // ── the two swap points ──
    this.vectors = new PgVectorStore(this.database);
    this.embeddings = new OpenAiEmbeddingProvider(config.embedding);

    this.content = new StaticContentSource();

    this.auth = AuthFactory.create(config.auth, this.database, this.cache);
    this.sessions = new BetterAuthSessionResolver(this.auth);

    const capabilityRepository = new PgCapabilityRepository(this.database);
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache);

    const apiKeyRepository = new PgApiKeyRepository(this.database);
    const apiKeyResolver = new ApiKeyResolver(apiKeyRepository, this.capabilities);
    this.principals = new PrincipalBuilder(this.sessions, apiKeyResolver, this.capabilities);

    const activity = new PgActivityLogger(this.database, this.clock);

    // ── use-cases, as features arrive ──
    // this.reactivateTask = new ReactivateTaskUseCase(
    //   new PgTaskRepository(this.database),
    //   this.authorizer,
    //   activity,
    //   this.clock,
    // );
    void activity;
  }

  public async healthy(): Promise<boolean> {
    return this.database.healthy();
  }

  public async dispose(): Promise<void> {
    await this.queuePublisher.close();
    await this.redis.close();
    await this.database.close();
  }
}
```

---

## Four rules for this class

**1. Ports are exposed as their abstract types.** `public readonly vectors: VectorStore`, not `PgVectorStore`. If the concrete type leaks into the public surface, a consumer eventually calls a Postgres-specific method and the swap stops being one line. The annotation is what enforces it.

**2. Never build request-scoped state into the container.** The `Principal` is passed as an argument to `execute()`, never held here. One container per **process**, not per request. Letting per-request state into the DI root couples you to a lifecycle model, and both the worker and any future NestJS migration become expensive.

**3. Config arrives as a constructor argument.** No `process.env` in this file or in any package. The two `env.ts` files are the boundary, and the ESLint rule from [05](05-lint-and-format.md) is what keeps it true.

**4. `dispose()` closes in reverse construction order.** Queues before Redis before Postgres. Closing Redis while BullMQ still holds blocking connections produces a hang on shutdown that looks like a deadlock, because it is one.

---

## Step 16.3 — Where use-cases go

A container with fifty use-cases as fields is unwieldy but it is honest, and it is still simpler than a module graph. Two ways to keep it readable as features arrive:

**Group by slice.** One private method per module, returning a small object:

```ts
public readonly task: TaskUseCases;

// …
this.task = this.buildTaskUseCases(activity);

private buildTaskUseCases(activity: ActivityLogger): TaskUseCases {
  const tasks = new PgTaskRepository(this.database);
  return {
    create: new CreateTaskUseCase(tasks, this.authorizer, activity),
    reactivate: new ReactivateTaskUseCase(tasks, this.authorizer, activity, this.clock),
  };
}
```

The oRPC router then reads `context.container.task.reactivate.execute(...)`, which mirrors the contract path exactly.

**Do not add lazy instantiation.** The temptation is a `get reactivateTask()` that constructs on first access. It saves microseconds at boot and costs you the property that a container which constructs successfully is a container where every dependency resolved. Eager construction means a wiring mistake is a startup crash rather than a request-time surprise at 3am.

---

## Step 16.4 — Testing with a container

The reason this class exists in this shape:

```ts
class TestContainer {
  public static build(overrides: Partial<Ports> = {}) {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00Z"));
    const authorizer = new Authorizer();
    const tasks = overrides.tasks ?? new InMemoryTaskRepository();
    const activity = overrides.activity ?? new RecordingActivityLogger();

    return {
      clock,
      tasks,
      activity,
      reactivateTask: new ReactivateTaskUseCase(tasks, authorizer, activity, clock),
    };
  }
}
```

No Postgres, no Redis, no S3, no Better Auth, no HTTP. Every use-case test builds a `Principal` directly with a hand-made `CapabilitySet` and asserts on behaviour. Integration tests — the ones that need real infrastructure — are then reserved for the adapters themselves and the auth routes, which is a much smaller and much less flaky set.

---

## Step 16.5 — The barrel

**`packages/composition/src/index.ts`**

```ts
export * from "./container.config.js";
export * from "./container.js";
```

---

## ✅ Gate

```bash
pnpm --filter @ratchet/composition build
```

```bash
grep -rn "process\.env" packages --include=*.ts | grep -v "\.config\.ts" | grep -v "src/migrate.ts" | grep -v "src/seed/" | grep -v "src/smoke.ts"
```

Returns **nothing**. No package reads its own configuration.

Every public field on `Container` that is a port is annotated with an abstract type, not a concrete class.

Do not proceed until this passes.

---

[← `@ratchet/auth`](15-auth-package.md) · [`@ratchet/api-client` →](17-api-client-package.md)

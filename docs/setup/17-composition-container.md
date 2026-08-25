# 17 · `@loadbearing/composition`

> The hand-written DI root that replaces a framework container. Roughly a hundred lines, no decorators, no reflection, no module graph.

**Delivers:** One `Container` class constructed identically by the web app and the worker.

**Prerequisite:** [16 · `@loadbearing/auth`](16-auth-package.md)

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

---

## Step 17.1 — `ContainerConfig`

**`packages/composition/src/container.config.ts`**

```ts
export interface ContainerConfig {
  readonly database: {
    readonly url: string;
    readonly maxConnections?: number;
  };
  readonly redis: {
    // Two instances, different durability. Neither is optional: a missing
    // queueUrl silently puts jobs on the instance that evicts them.
    readonly cacheUrl: string;
    readonly queueUrl: string;
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
  readonly logging: {
    readonly level: LogLevel;
    // Human-shaped output for a terminal. Never true in production — Alloy wants
    // one JSON object per line and nothing else.
    readonly pretty: boolean;
    // Two of the four log labels. Low-cardinality by construction.
    readonly app: string;
    readonly env: string;
  };
}
```

**Every value the system needs, in one shape, and none of it read from the environment.** `apps/web/src/env.ts` and `apps/worker/src/env.ts` are the only two files in the repository that touch `process.env`; they parse it, validate it, and hand this object down.

That is what lets you construct the entire system in a test with a fake database and a frozen clock — and it is what lets the same code run in a web server and a background worker without either fighting over environment variables. (The Tauri desktop app never constructs a `Container` at all — see [30](30-desktop-app.md).)

---

## Step 17.2 — `Container`

**`packages/composition/src/container.ts`**

```ts
import { ServerOnly, SystemClock, type Clock } from "@loadbearing/core";
import { JsonLogger, type LogLevel, type Logger } from "@loadbearing/observability";
import {
  type ActivityLogger,
  type AnalyticsReader,
  Authorizer,
  type CacheStore,
  type EmbeddingProvider,
  type QueuePublisher,
  type SessionResolver,
  type StorageGateway,
  type UnitOfWork,
  type VectorStore,
} from "@loadbearing/application";
import {
  ApiKeyResolver,
  AuthFactory,
  BetterAuthSessionResolver,
  CapabilityCache,
  type AuthInstance,
  MembershipReader,
  PrincipalBuilder,
} from "@loadbearing/auth";
import { ContentSource, SERVER_CATALOG, StaticContentSource } from "@loadbearing/content";
import {
  Database,
  PgActivityLogger,
  PgAnalyticsReader,
  PgApiKeyRepository,
  PgCapabilityRepository,
  PgMembershipReader,
  PgUnitOfWork,
  PgVectorStore,
  TransactionScope,
} from "@loadbearing/db";
import {
  BullMqQueuePublisher,
  OpenAiEmbeddingProvider,
  RedisCacheStore,
  RedisConnection,
  S3StorageGateway,
} from "@loadbearing/infrastructure";
import type { ContainerConfig } from "./container.config.js";

ServerOnly.assert("@loadbearing/composition");

export class Container {
  // ── infrastructure, private ───────────────────────────────
  private readonly database: Database;
  private readonly redis: RedisConnection;
  private readonly queuePublisher: BullMqQueuePublisher;
  private readonly transactions: TransactionScope;

  // ── shared primitives ─────────────────────────────────────
  public readonly clock: Clock;
  public readonly authorizer: Authorizer;
  public readonly logger: Logger;

  // ── ports, exposed as their abstract types ────────────────
  public readonly cache: CacheStore;
  public readonly storage: StorageGateway;
  public readonly queue: QueuePublisher;
  public readonly vectors: VectorStore;
  public readonly analytics: AnalyticsReader;
  public readonly embeddings: EmbeddingProvider;
  public readonly sessions: SessionResolver;
  public readonly activity: ActivityLogger;
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
    this.redis = new RedisConnection({
      cacheUrl: config.redis.cacheUrl,
      queueUrl: config.redis.queueUrl,
    });
    this.transactions = new TransactionScope();

    // First, so a failure in anything below it has somewhere to be recorded.
    // `app` and `env` are bound rather than passed through: they belong on every
    // line, and `JsonLoggerOptions` has no field of its own for either.
    this.logger = new JsonLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
      bound: { app: config.logging.app, env: config.logging.env },
    });

    this.clock = new SystemClock();
    this.authorizer = new Authorizer();

    this.cache = new RedisCacheStore(this.redis.client());
    this.storage = new S3StorageGateway(config.storage);
    this.queuePublisher = new BullMqQueuePublisher(this.redis.queueClient());
    this.queue = this.queuePublisher;
    this.unitOfWork = new PgUnitOfWork(this.database, this.transactions);

    // ── the three swap points ──
    this.vectors = new PgVectorStore(this.database, this.transactions);
    this.analytics = new PgAnalyticsReader(this.database, this.transactions);
    this.embeddings = new OpenAiEmbeddingProvider(config.embedding);

    this.content = new StaticContentSource(SERVER_CATALOG);

    // The fourth argument is what pins a tenant onto every session at sign-in. It is
    // the one place `PgMembershipReader` is bound to the `MembershipReader` port that
    // `auth` declares — `db` cannot implement it nominally, because `auth` already
    // depends on `db`, so this line is where a signature drift is caught.
    const membershipReader: MembershipReader = new PgMembershipReader(
      this.database,
      this.transactions,
    );
    this.auth = AuthFactory.create(config.auth, this.database, this.cache, membershipReader);
    this.sessions = new BetterAuthSessionResolver(this.auth);

    const capabilityRepository = new PgCapabilityRepository(this.database, this.transactions);
    this.capabilities = new CapabilityCache(capabilityRepository, this.cache);

    const apiKeyRepository = new PgApiKeyRepository(this.database, this.transactions);
    const apiKeyResolver = new ApiKeyResolver(apiKeyRepository, this.capabilities);
    this.principals = new PrincipalBuilder(this.sessions, apiKeyResolver, this.capabilities);

    // Shares the transaction scope, which is what makes the audit row commit
    // with the state change rather than beside it.
    this.activity = new PgActivityLogger(this.database, this.transactions, this.clock);

    // ── use-cases, as features arrive ──
    // this.reactivateTask = new ReactivateTaskUseCase(
    //   new PgTaskRepository(this.database, this.transactions),
    //   this.authorizer,
    //   this.activity,
    //   this.clock,
    // );
  }

  // Postgres and both Redis instances. A cache that is down degrades; a queue
  // that is down silently stops accepting work, which is worth knowing about.
  public async healthy(): Promise<boolean> {
    const [database, cache, queue] = await Promise.all([
      this.database.isHealthy(),
      this.redis.healthy("cache"),
      this.redis.healthy("queue"),
    ]);
    return database && cache && queue;
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

**3. Config arrives as a constructor argument.** No `process.env` in this file or in any package. The two `env.ts` files are the boundary, and Biome's `noProcessEnv` rule from [05](05-lint-and-format.md) is what keeps it true.

**The logger's `app` and `env` are bound fields, not options.** `JsonLoggerOptions` declares `level`, `pretty`, `sink`, `bound`, `clock` and `random` — and nothing else. Spreading `config.logging` into it would compile, because excess-property checking does not apply to a variable, and both values would be silently dropped: no error, no label, and a log platform that cannot tell `web` from `worker`.

Binding them puts `app` and `env` on every line, which is what lets the Alloy pipeline read all four labels out of the JSON body rather than inferring two of them from container metadata that differs between Compose, Kubernetes, and a host-run `pnpm dev` ([11](11-local-infrastructure.md)). The application knows what it is; the orchestrator's name for the process is incidental.

**4. `dispose()` closes in reverse construction order.** Queues before the Redis connections before Postgres. Closing Redis while BullMQ still holds blocking connections produces a hang on shutdown that looks like a deadlock, because it is one.

`RedisConnection.close()` quits both instances, which is why they sit behind one object rather than as two fields on the container. Two fields is two things to remember at every shutdown path, and the one that gets forgotten is the queue — where an unclean close means in-flight jobs are redelivered rather than completed.

**The logger is constructed first and disposed last**, which is the same rule read from both ends. Constructed first, because a `Database` that cannot reach Postgres should produce a structured line rather than a stack trace on stderr. Disposed last, because everything closing above it may have something to say on the way out.

> [!NOTE]
> **`logger` is a shared primitive, not a port.** It sits with `clock` and `authorizer` rather than in the port block, and there is no `Logger` abstract class in `packages/application/src/port/` — the domain layer does not log at all ([12](12-application-package.md)). The seam lives in `@loadbearing/observability`, low enough in the graph that `db`, `infrastructure`, `auth`, and both apps can reach it.

---

## Step 17.3 — Where use-cases go

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

## Step 17.4 — Testing with a container

The reason this class exists in this shape:

```ts
class TestContainer {
  public static build(overrides: Partial<Ports> = {}) {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00Z"));
    const logger = new SilentLogger();
    const authorizer = new Authorizer();
    const tasks = overrides.tasks ?? new InMemoryTaskRepository();
    const activity = overrides.activity ?? new RecordingActivityLogger();
    const analytics = overrides.analytics ?? new StubAnalyticsReader();

    return {
      clock,
      tasks,
      activity,
      analytics,
      reactivateTask: new ReactivateTaskUseCase(tasks, authorizer, activity, clock),
    };
  }
}
```

No Postgres, no Redis, no S3, no Better Auth, no HTTP. Every use-case test builds a `Principal` directly with a hand-made `CapabilitySet` and asserts on behaviour. Integration tests — the ones that need real infrastructure — are then reserved for the adapters themselves and the auth routes, which is a much smaller and much less flaky set.

**A fake for every port, including the ones a given test does not use.** `StubAnalyticsReader` returns empty arrays; that is enough, and it means adding a port to `application` shows up here as one line rather than as a compile error in forty specs.

**Query counts belong in that integration set.** A fake repository cannot tell you that `resolveFor` became 3 + N queries — only a real adapter against a real database can. That is the assertion [13](13-db-package.md) adds next to the repository, and it is the reason the integration tier exists at all rather than being a slower copy of the unit tier.

---

## Step 17.5 — The barrel

**`packages/composition/src/index.ts`**

```ts
export type { ContainerConfig } from "./container.config.js";
export { Container } from "./container.js";
```

**`TestContainer` is not exported.** It exists for specs inside packages that already depend on `composition`, and leaving it off the barrel is the difference between "test helper" and "public API" — a distinction `export *` could not have made.

---

## ✅ Gate

```bash
pnpm --filter @loadbearing/composition build
```

```bash
grep -rn "process\.env" packages --include=*.ts | grep -v "\.config\.ts" | grep -v "src/migrate/" | grep -v "src/seed/" | grep -v "src/smoke.ts"
```

Returns **nothing**. No package reads its own configuration.

Every public field on `Container` that is a port is annotated with an abstract type, not a concrete class.

Do not proceed until this passes.

---

[← `@loadbearing/auth`](16-auth-package.md) · [`@loadbearing/api-client` →](18-api-client-package.md)

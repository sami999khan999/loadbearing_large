import { z } from "zod";

// The second and last `process.env` reader, and deliberately not sharing the web app's
// schema — see docs/reference/env.md.
const Schema = z
  .object({
    DATABASE_URL: z.url(),
    // The same server without the pooler. Migrations, the seed and the archive's DDL
    // use it — see docs/reference/env.md.
    DATABASE_DIRECT_URL: z.url().optional(),
    // Node 0's streaming standby — `24.3`. Reads move onto it only while
    // `platform_policy.replica_reads_enabled` is on, and only once it has caught up.
    DATABASE_REPLICA_URL: z.url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
    DATABASE_POOL_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1).default(5_000),
    // 120 s, against the web app's 30 s: a batch holds no browser open, and the outbox
    // relay inside `PgUnitOfWork.run` is the long transaction this exists for.
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1).default(120_000),
    REDIS_CACHE_URL: z.url(),
    REDIS_QUEUE_URL: z.url(),
    // Live frames; the cache instance when unset. See docs/infra/reference/redis.md.
    REDIS_REALTIME_URL: z.url().optional(),
    // The assistant's answer logs; the realtime instance when unset, then the cache's.
    REDIS_ASSISTANT_URL: z.url().optional(),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    // Defaulted like `LOG_PRETTY`, and to the production answer: real S3 wants virtual-host
    // addressing, MinIO wants path-style, and `.env.example` sets `true` for the local stack.
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    // Both or neither — `25.3`. A class the bucket has, and the days before an archived
    // month moves to it. On MinIO the class is a configured tier's name.
    S3_COLD_STORAGE_CLASS: z.string().min(1).optional(),
    S3_COLD_TRANSITION_DAYS: z.coerce.number().int().min(1).optional(),

    // In both processes because both build a `Container`, which treats mail as required
    // rather than optional.
    SMTP_URL: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    // 32 bytes, base64, for SMTP passwords saved from the platform Mail page (`26.11`).
    // Never derived from AUTH_SECRET: rotating that must not break every tenant's mail.
    MAIL_SECRET_KEY: z.string().min(1).optional(),
    // Web push (`26.3`): all three or none. `npx web-push generate-vapid-keys` makes the
    // pair once; changing it orphans every browser already subscribed.
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:)/)
      .optional(),
    // Required here too, and this is the process that needs it: the worker renders the
    // invitation link, and it parses no auth configuration to borrow an origin from.
    APP_BASE_URL: z.url(),

    // `none` searches the chunk text and calls nobody. `openai` and `gemini` embed, need
    // the key below, and default the model when unset. See infrastructure's embedding.md.
    EMBEDDING_PROVIDER: z.enum(["none", "openai", "gemini"]).default("none"),
    EMBEDDING_API_KEY: z.string().min(1).optional(),
    EMBEDDING_MODEL: z.string().min(1).optional(),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
    // The name before `EMBEDDING_API_KEY`. Read only to refuse it: see the rule below.
    OPENAI_API_KEY: z.string().optional(),
    // The AI assistant's chat model (`AI.1`). `none` turns the feature off and `fake` streams
    // a canned answer calling nobody; the other three need the key. See assistant.md.
    ASSISTANT_PROVIDER: z.enum(["none", "fake", "openai", "openrouter", "gemini"]).default("none"),
    ASSISTANT_API_KEY: z.string().min(1).optional(),
    ASSISTANT_MODEL: z.string().min(1).optional(),
    ASSISTANT_ENDPOINT: z.url().optional(),
    // The longest answer in tokens, and one organization's tokens a UTC day: 0 is no cap.
    ASSISTANT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
    // `fake` only: milliseconds between words, so an answer streams like a real one.
    ASSISTANT_FAKE_DELAY_MS: z.coerce.number().int().min(0).default(0),
    ASSISTANT_ORG_DAILY_TOKENS: z.coerce.number().int().min(0).default(0),

    // Per process. The cap exists to stop one runaway tab, which is local by
    // construction, and the age is what releases a channel a leaked reader is holding.
    REALTIME_MAX_STREAMS_PER_USER: z.coerce.number().int().positive().default(8),
    REALTIME_STREAM_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(1800),

    // Longer than your longest job, shorter than your orchestrator's SIGKILL timer: above
    // it just means the platform kills you mid-drain.
    WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
    // The queues this process serves, comma separated; every queue when unset. Names are
    // checked against the lanes at boot, because this file cannot see `QueueName`.
    WORKER_QUEUES: z
      .string()
      .optional()
      .transform((v) => {
        const names = (v ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        return names.length > 0 ? names : undefined;
      }),
    // The sum of every lane's concurrency in one process. A boot over it is refused, not
    // warned about: each in-flight job may hold a pool connection.
    WORKER_PROCESS_MAX_CONCURRENCY: z.coerce.number().int().positive().default(64),
    WORKER_EMBEDDING_CONCURRENCY: z.coerce.number().int().positive().default(4),
    // Serial by default: these jobs take table-level locks and can deadlock on the same
    // partition.
    WORKER_MAINTENANCE_CONCURRENCY: z.coerce.number().int().positive().default(1),
    // The deployment's own answer for how long a moved tenant's rows stay behind. An
    // operator overrides it on `platform_policy`; this is what an unset row means.
    SHARD_MOVE_GRACE_DAYS: z.coerce.number().int().min(0).default(7),
    WORKER_MAIL_CONCURRENCY: z.coerce.number().int().positive().default(4),
    WORKER_EVENT_CONCURRENCY: z.coerce.number().int().positive().default(8),
    // Two. The digest fan-out is one job a day and each tenant's digest is I/O bound
    // on the mail queue, which has its own limiter.
    WORKER_NOTIFICATION_CONCURRENCY: z.coerce.number().int().positive().default(2),
    // A provider's cap, expressed once. Ten a second is under every managed sender's
    // free tier and well under a self-hosted relay's.
    WORKER_MAIL_RATE_PER_MINUTE: z.coerce.number().int().positive().default(600),
    // An answer holds a provider stream and no database connection, so many fit. The rate
    // is the provider contract's requests a minute, across this process's answers.
    WORKER_ASSISTANT_CONCURRENCY: z.coerce.number().int().positive().default(32),
    WORKER_ASSISTANT_RATE_PER_MINUTE: z.coerce.number().int().positive().default(600),
    // Serial, and not a dial worth turning: correctness rests on there being exactly one
    // writer, not on the insert being idempotent.
    WORKER_ANALYTICS_CONCURRENCY: z.coerce.number().int().positive().max(1).default(1),

    // The same block the web app parses: a worker with no log output cannot be operated.

    // ── the swappable stores ──
    // A driver plus the connection detail it needs, so adopting a store is these variables
    // and nothing else.
    VECTOR_DRIVER: z.enum(["pgvector"]).default("pgvector"),
    // Their absence keeps ClickHouse stopped. Present, the projection and its
    // reconciliation run; no feature reads the store back yet.
    CLICKHOUSE_URL: z.url().optional(),
    // ClickHouse's own out-of-the-box values: a default naming the project would be a
    // credential baked into shipped code.
    CLICKHOUSE_DATABASE: z.string().min(1).default("default"),
    CLICKHOUSE_USER: z.string().min(1).default("default"),
    CLICKHOUSE_PASSWORD: z.string().default(""),
    // Unset means no `LogReader`. Logs are still written to stdout and shipped by Alloy
    // either way.
    LOKI_URL: z.url().optional(),
    LOKI_TENANT_ID: z.string().optional(),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_PRETTY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    // Two of the four log labels. Low-cardinality by construction, and this default is
    // why `.env` must not pin `APP` globally — both processes would claim one name.
    APP: z.string().default("worker"),
    ENV: z.string().default("development"),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  // Two cross-field rules: the compose container is `ratchet/ratchet` and these default
  // to ClickHouse's own `default/default`, and a cold tier is two keys or none.
  .superRefine((env, ctx) => {
    // A provider with no key would fail on the first document, long after the deploy.
    if (env.EMBEDDING_PROVIDER !== "none" && !env.EMBEDDING_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["EMBEDDING_API_KEY"],
        message: `Required when EMBEDDING_PROVIDER is "${env.EMBEDDING_PROVIDER}".`,
      });
    }

    if (
      env.ASSISTANT_PROVIDER !== "none" &&
      env.ASSISTANT_PROVIDER !== "fake" &&
      !env.ASSISTANT_API_KEY
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["ASSISTANT_API_KEY"],
        message: `Required when ASSISTANT_PROVIDER is "${env.ASSISTANT_PROVIDER}".`,
      });
    }

    // Renamed by `AI.0`. Ignoring it would quietly drop a deployment to text search.
    if (env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "Renamed: set EMBEDDING_PROVIDER=openai and EMBEDDING_API_KEY instead.",
      });
    }

    // One without the other is a transition that silently never happens.
    if (!env.S3_COLD_STORAGE_CLASS !== !env.S3_COLD_TRANSITION_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: [env.S3_COLD_STORAGE_CLASS ? "S3_COLD_TRANSITION_DAYS" : "S3_COLD_STORAGE_CLASS"],
        message: "Set S3_COLD_STORAGE_CLASS and S3_COLD_TRANSITION_DAYS together.",
      });
    }

    // Unreadable without an hours-long restore, and a cold restore reads with `GetObject`.
    if (env.S3_COLD_STORAGE_CLASS === "GLACIER" || env.S3_COLD_STORAGE_CLASS === "DEEP_ARCHIVE") {
      ctx.addIssue({
        code: "custom",
        path: ["S3_COLD_STORAGE_CLASS"],
        message: "Use a class read without a restore: STANDARD_IA, ONEZONE_IA or GLACIER_IR.",
      });
    }

    if (!env.CLICKHOUSE_URL) return;

    for (const key of ["CLICKHOUSE_DATABASE", "CLICKHOUSE_USER"] as const) {
      if (env[key] === "default") {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Set it explicitly when CLICKHOUSE_URL is set.",
        });
      }
    }
  });

// `DATABASE_SHARD_<n>_URL` in index order, each with an optional `_DIRECT_URL` and
// `_REPLICA_URL` beside it. Absent is one node, which is every deployment until the split.
const shardsFromEnv = (): readonly { url: string; directUrl: string; replicaUrl?: string }[] => {
  const found: { index: number; url: string; directUrl: string; replicaUrl?: string }[] = [];

  for (const [name, value] of Object.entries(process.env)) {
    const match = /^DATABASE_SHARD_(\d+)_URL$/.exec(name);
    if (!match?.[1] || !value) continue;

    const index = Number(match[1]);
    // Node 0 is `DATABASE_URL`; a `DATABASE_SHARD_0_URL` beside it would be two names
    // for one pool and a disagreement about which is the catalog.
    if (index < 1) continue;

    found.push({
      index,
      url: value,
      directUrl: process.env[`DATABASE_SHARD_${index}_DIRECT_URL`] ?? value,
      // `||`, not `??`: an empty value is "no standby", the way `.env.example` shows one.
      replicaUrl: process.env[`DATABASE_SHARD_${index}_REPLICA_URL`] || undefined,
    });
  }

  // Contiguity-checked: the cluster indexes this array, so a gap puts node 3 at
  // index 2 and resolves every tenant on it to the wrong database.
  const sorted = found.toSorted((left, right) => left.index - right.index);
  sorted.forEach((shard, at) => {
    if (shard.index !== at + 1) {
      throw new Error(`DATABASE_SHARD_${shard.index}_URL has no shard ${at + 1} before it.`);
    }
  });

  return sorted.map(({ url, directUrl, replicaUrl }) => ({ url, directUrl, replicaUrl }));
};

export class Env {
  private constructor() {}

  // Parsed at module load, not on first access. A missing `DATABASE_URL` should crash
  // the process at boot with a field path, not fail the first job an hour later.
  private static readonly parsed = Schema.parse(process.env);

  public static get isProduction(): boolean {
    return Env.parsed.NODE_ENV === "production";
  }

  public static get shutdownTimeoutMs(): number {
    return Env.parsed.WORKER_SHUTDOWN_TIMEOUT_MS;
  }

  public static get queues(): readonly string[] | undefined {
    return Env.parsed.WORKER_QUEUES;
  }

  public static get processMaxConcurrency(): number {
    return Env.parsed.WORKER_PROCESS_MAX_CONCURRENCY;
  }

  // Per worker instance, never global. Four instances at concurrency 4 is sixteen
  // in-flight jobs, each of which may hold a Postgres connection.
  public static get embeddingConcurrency(): number {
    return Env.parsed.WORKER_EMBEDDING_CONCURRENCY;
  }

  public static get maintenanceConcurrency(): number {
    return Env.parsed.WORKER_MAINTENANCE_CONCURRENCY;
  }

  public static get moveGraceDays(): number {
    return Env.parsed.SHARD_MOVE_GRACE_DAYS;
  }

  public static get analyticsConcurrency(): number {
    return Env.parsed.WORKER_ANALYTICS_CONCURRENCY;
  }

  public static get mailConcurrency(): number {
    return Env.parsed.WORKER_MAIL_CONCURRENCY;
  }

  public static get mailRatePerMinute(): number {
    return Env.parsed.WORKER_MAIL_RATE_PER_MINUTE;
  }

  public static get assistantConcurrency(): number {
    return Env.parsed.WORKER_ASSISTANT_CONCURRENCY;
  }

  public static get assistantRatePerMinute(): number {
    return Env.parsed.WORKER_ASSISTANT_RATE_PER_MINUTE;
  }

  public static get eventConcurrency(): number {
    return Env.parsed.WORKER_EVENT_CONCURRENCY;
  }

  public static get notificationConcurrency(): number {
    return Env.parsed.WORKER_NOTIFICATION_CONCURRENCY;
  }

  // Read by `WorkerBootstrap` to compare against what it is about to run concurrently.
  // The pool itself is built from `containerConfig()`; this is the same number.
  public static get databasePoolMax(): number {
    return Env.parsed.DATABASE_POOL_MAX;
  }

  // Where environment becomes `ContainerConfig`. No `auth` block, so this process holds
  // no session secret.
  public static containerConfig() {
    const e = Env.parsed;
    return {
      database: {
        url: e.DATABASE_URL,
        directUrl: e.DATABASE_DIRECT_URL ?? e.DATABASE_URL,
        replicaUrl: e.DATABASE_REPLICA_URL,
        poolMax: e.DATABASE_POOL_MAX,
        poolIdleTimeoutMs: e.DATABASE_POOL_IDLE_TIMEOUT_MS,
        poolConnectTimeoutMs: e.DATABASE_POOL_CONNECT_TIMEOUT_MS,
        statementTimeoutMs: e.DATABASE_STATEMENT_TIMEOUT_MS,
        moveGraceDays: e.SHARD_MOVE_GRACE_DAYS,
        shards: shardsFromEnv(),
      },
      redis: {
        cacheUrl: e.REDIS_CACHE_URL,
        queueUrl: e.REDIS_QUEUE_URL,
        ...(e.REDIS_REALTIME_URL ? { realtimeUrl: e.REDIS_REALTIME_URL } : {}),
        ...(e.REDIS_ASSISTANT_URL ? { assistantUrl: e.REDIS_ASSISTANT_URL } : {}),
      },
      storage: {
        endpoint: e.S3_ENDPOINT,
        region: e.S3_REGION,
        bucket: e.S3_BUCKET,
        accessKey: e.S3_ACCESS_KEY,
        secretKey: e.S3_SECRET_KEY,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
        coldTier:
          e.S3_COLD_STORAGE_CLASS && e.S3_COLD_TRANSITION_DAYS
            ? { storageClass: e.S3_COLD_STORAGE_CLASS, afterDays: e.S3_COLD_TRANSITION_DAYS }
            : undefined,
      },
      email: {
        url: e.SMTP_URL,
        from: e.EMAIL_FROM,
        baseUrl: e.APP_BASE_URL,
        ...(e.MAIL_SECRET_KEY ? { secretKey: e.MAIL_SECRET_KEY } : {}),
      },
      ...(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT
        ? {
            push: {
              publicKey: e.VAPID_PUBLIC_KEY,
              privateKey: e.VAPID_PRIVATE_KEY,
              subject: e.VAPID_SUBJECT,
            },
          }
        : {}),
      embedding: {
        provider: e.EMBEDDING_PROVIDER,
        dimensions: e.EMBEDDING_DIMENSIONS,
        ...(e.EMBEDDING_API_KEY ? { apiKey: e.EMBEDDING_API_KEY } : {}),
        ...(e.EMBEDDING_MODEL ? { model: e.EMBEDDING_MODEL } : {}),
      },
      assistant: {
        provider: e.ASSISTANT_PROVIDER,
        ...(e.ASSISTANT_API_KEY ? { apiKey: e.ASSISTANT_API_KEY } : {}),
        ...(e.ASSISTANT_MODEL ? { model: e.ASSISTANT_MODEL } : {}),
        ...(e.ASSISTANT_ENDPOINT ? { endpoint: e.ASSISTANT_ENDPOINT } : {}),
        maxOutputTokens: e.ASSISTANT_MAX_OUTPUT_TOKENS,
        orgDailyTokens: e.ASSISTANT_ORG_DAILY_TOKENS,
        fakeDelayMs: e.ASSISTANT_FAKE_DELAY_MS,
      },
      realtime: {
        maxStreamsPerUser: e.REALTIME_MAX_STREAMS_PER_USER,
        streamMaxAgeSeconds: e.REALTIME_STREAM_MAX_AGE_SECONDS,
      },
      // Undefined unless a URL was given, which is what `Container` branches on: a
      // partly-filled object builds a connection pointed at nothing.
      analytics: {
        clickhouse: e.CLICKHOUSE_URL
          ? {
              url: e.CLICKHOUSE_URL,
              database: e.CLICKHOUSE_DATABASE,
              username: e.CLICKHOUSE_USER,
              password: e.CLICKHOUSE_PASSWORD,
            }
          : undefined,
      },
      vector: { driver: e.VECTOR_DRIVER },
      logs: e.LOKI_URL
        ? { driver: "loki" as const, url: e.LOKI_URL, tenantId: e.LOKI_TENANT_ID }
        : undefined,
      logging: { level: e.LOG_LEVEL, pretty: e.LOG_PRETTY, app: e.APP, env: e.ENV },
    } as const;
  }
}

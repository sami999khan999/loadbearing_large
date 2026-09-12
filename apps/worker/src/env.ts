import { z } from "zod";

// The second and last `process.env` reader, and deliberately not sharing the web app's
// schema — see docs/reference/env.md.
const Schema = z
  .object({
    DATABASE_URL: z.url(),
    REDIS_CACHE_URL: z.url(),
    REDIS_QUEUE_URL: z.url(),

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

    // In both processes because both build a `Container`, which treats mail as required
    // rather than optional.
    SMTP_URL: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    // Required here too, and this is the process that needs it: the worker renders the
    // invitation link, and it parses no auth configuration to borrow an origin from.
    APP_BASE_URL: z.url(),

    EMBEDDING_MODEL: z.string().min(1),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
    OPENAI_API_KEY: z.string().default(""),

    // Longer than your longest job, shorter than your orchestrator's SIGKILL timer: above
    // it just means the platform kills you mid-drain.
    WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
    WORKER_EMBEDDING_CONCURRENCY: z.coerce.number().int().positive().default(4),
    // Serial by default: these jobs take table-level locks and can deadlock on the same
    // partition.
    WORKER_MAINTENANCE_CONCURRENCY: z.coerce.number().int().positive().default(1),
    WORKER_MAIL_CONCURRENCY: z.coerce.number().int().positive().default(4),
    WORKER_EVENT_CONCURRENCY: z.coerce.number().int().positive().default(8),
    // Two. The digest fan-out is one job a day and each tenant's digest is I/O bound
    // on the mail queue, which has its own limiter.
    WORKER_NOTIFICATION_CONCURRENCY: z.coerce.number().int().positive().default(2),
    // A provider's cap, expressed once. Ten a second is under every managed sender's
    // free tier and well under a self-hosted relay's.
    WORKER_MAIL_RATE_PER_MINUTE: z.coerce.number().int().positive().default(600),
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
  // The one cross-field rule here: the compose container is `ratchet/ratchet` and these
  // default to ClickHouse's own `default/default`, which cannot authenticate against it.
  .superRefine((env, ctx) => {
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

  // Per worker instance, never global. Four instances at concurrency 4 is sixteen
  // in-flight jobs, each of which may hold a Postgres connection.
  public static get embeddingConcurrency(): number {
    return Env.parsed.WORKER_EMBEDDING_CONCURRENCY;
  }

  public static get maintenanceConcurrency(): number {
    return Env.parsed.WORKER_MAINTENANCE_CONCURRENCY;
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

  public static get eventConcurrency(): number {
    return Env.parsed.WORKER_EVENT_CONCURRENCY;
  }

  public static get notificationConcurrency(): number {
    return Env.parsed.WORKER_NOTIFICATION_CONCURRENCY;
  }

  // Where environment becomes `ContainerConfig`. No `auth` block, so this process holds
  // no session secret.
  public static containerConfig() {
    const e = Env.parsed;
    return {
      database: { url: e.DATABASE_URL },
      redis: { cacheUrl: e.REDIS_CACHE_URL, queueUrl: e.REDIS_QUEUE_URL },
      storage: {
        endpoint: e.S3_ENDPOINT,
        region: e.S3_REGION,
        bucket: e.S3_BUCKET,
        accessKey: e.S3_ACCESS_KEY,
        secretKey: e.S3_SECRET_KEY,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
      },
      email: { url: e.SMTP_URL, from: e.EMAIL_FROM, baseUrl: e.APP_BASE_URL },
      embedding: {
        apiKey: e.OPENAI_API_KEY,
        model: e.EMBEDDING_MODEL,
        dimensions: e.EMBEDDING_DIMENSIONS,
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

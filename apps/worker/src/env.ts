import { z } from "zod";

// The second and last `process.env` reader in the repository — the other is
// `apps/web/src/env.ts` (24). Everything else receives configuration.
//
// Deliberately a smaller schema than the web app's, and deliberately not shared with
// it: a common schema would force this process to carry an `AUTH_SECRET` it never
// uses, which is one more secret in one more environment for no reason.
const Schema = z.object({
  DATABASE_URL: z.url(),
  REDIS_CACHE_URL: z.url(),
  REDIS_QUEUE_URL: z.url(),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).transform((v) => v === "true"),

  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  OPENAI_API_KEY: z.string().default(""),

  // How long `worker.close()` is given to drain in-flight jobs before the process
  // exits anyway. Longer than your longest job, shorter than your orchestrator's
  // SIGKILL timer — a value above it just means the platform kills you mid-drain.
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  WORKER_EMBEDDING_CONCURRENCY: z.coerce.number().int().positive().default(4),
  // Serial by default. Maintenance jobs take table-level locks and run nightly; two
  // overlapping buys nothing and can deadlock on the same partition.
  WORKER_MAINTENANCE_CONCURRENCY: z.coerce.number().int().positive().default(1),

  // The same block the web app parses. A worker with no log output is a worker you
  // cannot operate.
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

  // The boundary where environment becomes `ContainerConfig` (17). No `auth` block:
  // the worker never issues or validates a session, so `Container` builds no
  // `AuthFactory` and this process holds no session secret.
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
      embedding: {
        apiKey: e.OPENAI_API_KEY,
        model: e.EMBEDDING_MODEL,
        dimensions: e.EMBEDDING_DIMENSIONS,
      },
      logging: { level: e.LOG_LEVEL, pretty: e.LOG_PRETTY, app: e.APP, env: e.ENV },
    } as const;
  }
}

// The marker that makes this file server-only to Vite as well as to the reader: Start
// fails the build if it reaches the client graph. See docs/reference/env.md.
import "@tanstack/react-start/server-only";
import { z } from "zod";

// One of exactly two `process.env` readers in the repository — the other is
// `apps/worker/src/env.ts` (25). Everything else receives configuration.
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

    // A short secret is a real weakness, and this schema is the only place anyone will
    // ever check.
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.url(),
    AUTH_TRUSTED_ORIGINS: z.string().transform((v) => v.split(",").map((s) => s.trim())),
    AUTH_SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive(),
    // The revocation window, capped in the schema rather than by convention: a deploy
    // that raises it fails at boot instead of widening the gap silently.
    AUTH_COOKIE_CACHE_MAX_AGE_SECONDS: z.coerce.number().int().positive().max(60),
    AUTH_REQUIRE_EMAIL_VERIFICATION: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // What an authenticator app shows beside a TOTP code. Changing it after anyone has
    // enrolled leaves their authenticator naming a product that no longer exists.
    AUTH_APP_NAME: z.string().min(1).default("Loadbearing"),
    // How a new user acquires the membership without which no session is issued.
    // `personal` is the only mode that works against an empty database.
    AUTH_ENROLMENT_MODE: z.enum(["personal", "bootstrap", "invite"]).default("personal"),
    // A ceiling on the total, which the 5/min rate limit on `/organization/create` does
    // not give: each tenant seeds four roles and every permission the registry defines.
    AUTH_MAX_OWNED_ORGANIZATIONS: z.coerce.number().int().positive().default(10),
    // The same slug `pnpm db:seed` creates. Unset means no enrolment at all, which is
    // the production posture and why there is no default.
    BOOTSTRAP_ORGANIZATION_SLUG: z.string().min(1).optional(),

    // Both optional: the container builds a provider only when both are present. The
    // authorised redirect URI is `${AUTH_URL}/api/auth/callback/google`.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    // One URL rather than five fields, and required: with verification on by default, a
    // process that cannot send is one whose sign-ups never complete.
    SMTP_URL: z.string().min(1),
    // Never defaulted: an address the sending domain does not authorise bounces or lands
    // in spam, silently.
    EMAIL_FROM: z.string().min(1),
    // The origin a link in a message points at. Separate from `AUTH_URL`, which is Better
    // Auth's own: the worker sends invitation mail and parses no auth configuration.
    APP_BASE_URL: z.url(),

    EMBEDDING_MODEL: z.string().min(1),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
    OPENAI_API_KEY: z.string().default(""),

    // ── the swappable stores ──
    // A driver plus the connection detail it needs, so adopting a store is these
    // variables and nothing else.
    VECTOR_DRIVER: z.enum(["pgvector"]).default("pgvector"),
    // Its absence keeps ClickHouse stopped. Present, the projection and its
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
    // Two of the four log labels. Low-cardinality by construction.
    APP: z.string().default("web"),
    ENV: z.string().default("development"),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  // Two cross-field rules, and each earns the exception: `bootstrap` with no slug
  // silently enrols nobody, and ClickHouse's defaults cannot reach its own container.
  .superRefine((env, ctx) => {
    if (env.AUTH_ENROLMENT_MODE === "bootstrap" && !env.BOOTSTRAP_ORGANIZATION_SLUG) {
      ctx.addIssue({
        code: "custom",
        path: ["BOOTSTRAP_ORGANIZATION_SLUG"],
        message: 'Required when AUTH_ENROLMENT_MODE is "bootstrap".',
      });
    }

    // The compose container is `ratchet/ratchet`; these default to ClickHouse's own
    // `default/default`, which cannot authenticate against it. See docs/reference/env.md.
    if (env.CLICKHOUSE_URL) {
      for (const key of ["CLICKHOUSE_DATABASE", "CLICKHOUSE_USER"] as const) {
        if (env[key] === "default") {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Set it explicitly when CLICKHOUSE_URL is set.",
          });
        }
      }
    }
  });

export class Env {
  private constructor() {}

  // At module load, not on first access: a missing `AUTH_SECRET` should crash at boot
  // with a field path, not 500 on the first sign-in an hour later.
  private static readonly parsed = Schema.parse(process.env);

  public static get isProduction(): boolean {
    return Env.parsed.NODE_ENV === "production";
  }

  // The absolute base Better Auth signs cookies against. The browser never needs it, and
  // asking for it from a component put this schema in the client bundle once already.
  public static get authUrl(): string {
    return `${Env.parsed.AUTH_URL}/api/auth`;
  }

  // The one origin allowlist, read by Better Auth's CSRF check and by the CORS layer.
  // A second hardcoded copy is how one of them goes stale.
  public static get trustedOrigins(): readonly string[] {
    return Env.parsed.AUTH_TRUSTED_ORIGINS;
  }

  // Read by `session.fn.ts` and put on the session snapshot, because the sign-in page
  // has to decide whether to render a Google button and cannot see this schema.
  public static get googleEnabled(): boolean {
    return Boolean(Env.parsed.GOOGLE_CLIENT_ID && Env.parsed.GOOGLE_CLIENT_SECRET);
  }

  // The boundary where environment becomes `ContainerConfig` (17).
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
      auth: {
        secret: e.AUTH_SECRET,
        baseUrl: e.AUTH_URL,
        trustedOrigins: e.AUTH_TRUSTED_ORIGINS,
        sessionMaxAgeSeconds: e.AUTH_SESSION_MAX_AGE_SECONDS,
        cookieCacheMaxAgeSeconds: e.AUTH_COOKIE_CACHE_MAX_AGE_SECONDS,
        requireEmailVerification: e.AUTH_REQUIRE_EMAIL_VERIFICATION,
        appName: e.AUTH_APP_NAME,
        enrolmentMode: e.AUTH_ENROLMENT_MODE,
        bootstrapOrganizationSlug: e.BOOTSTRAP_ORGANIZATION_SLUG,
        maxOwnedOrganizations: e.AUTH_MAX_OWNED_ORGANIZATIONS,
        // Both halves or neither: a partly-filled pair builds a provider pointed at a
        // client Google rejects.
        google:
          e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
            ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
            : undefined,
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

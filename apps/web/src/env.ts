// The marker that makes this file server-only to Vite as well as to the reader. Start's
// import-protection plugin fails the build when a module carrying it is reachable from
// the client graph, which is the one guarantee a naming convention cannot give: before
// it was here, `Env` shipped in the browser bundle as `Schema.parse({})` and threw on
// `DATABASE_URL` before the first render.
import "@tanstack/react-start/server-only";
import { z } from "zod";

// One of exactly two `process.env` readers in the repository — the other is
// `apps/worker/src/env.ts` (25). Everything else receives configuration.
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

  // A short secret is a real weakness, and this schema is the only place anyone will
  // ever check.
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.url(),
  AUTH_TRUSTED_ORIGINS: z.string().transform((v) => v.split(",").map((s) => s.trim())),
  AUTH_SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive(),
  AUTH_DESKTOP_SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive(),
  // The revocation window. Capped in the schema, not by convention — a deploy that
  // raises it to "improve cache hit rate" fails at boot instead of quietly widening
  // the gap between removing access and access stopping (16.9).
  AUTH_COOKIE_CACHE_MAX_AGE_SECONDS: z.coerce.number().int().positive().max(60),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  OPENAI_API_KEY: z.string().default(""),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_PRETTY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Two of the four log labels. Low-cardinality by construction.
  APP: z.string().default("web"),
  ENV: z.string().default("development"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export class Env {
  private constructor() {}

  // Parsed at module load, not on first access. A missing `AUTH_SECRET` should crash
  // the process at boot with a field path, not produce a 500 on the first sign-in an
  // hour later.
  private static readonly parsed = Schema.parse(process.env);

  public static get isProduction(): boolean {
    return Env.parsed.NODE_ENV === "production";
  }

  // The absolute base Better Auth signs cookies and builds callback URLs against. The
  // browser never needs it — `Endpoint.auth` is the same-origin path — and asking for it
  // from a component is what put this whole schema in the client bundle once already.
  public static get authUrl(): string {
    return `${Env.parsed.AUTH_URL}/api/auth`;
  }

  // The one origin allowlist. Better Auth's CSRF check reads it through
  // `containerConfig()`; the CORS layer reads it directly. Two consumers, one list —
  // a second hardcoded copy is how one of them goes stale.
  public static get trustedOrigins(): readonly string[] {
    return Env.parsed.AUTH_TRUSTED_ORIGINS;
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

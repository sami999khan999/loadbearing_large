import type { ContainerConfig } from "../../src/container/container.config.js";

// Pinned rather than read from the environment, for the same reason `infrastructure`'s
// harness pins its URL: a spec aimed elsewhere fails as a connection error, unexplained.
const REDIS_CACHE_URL = "redis://localhost:6379";
const REDIS_QUEUE_URL = "redis://localhost:6380";

export const DATABASE_URL = "postgres://ratchet:ratchet@localhost:5432/ratchet";

// Everything a container needs and nothing a deployment would decide. `auth`,
// `analytics` and `logs` are absent, which is the shape the throwing getters are about.
export const baseConfig = (): ContainerConfig => ({
  database: { url: DATABASE_URL },
  redis: { cacheUrl: REDIS_CACHE_URL, queueUrl: REDIS_QUEUE_URL },
  storage: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "loadbearing",
    accessKey: "ratchet",
    secretKey: "ratchetsecret",
    forcePathStyle: true,
  },
  email: { url: "smtp://localhost:1025", from: "noreply@example.test" },
  embedding: { apiKey: "sk-not-used", model: "text-embedding-3-small", dimensions: 1536 },
  vector: { driver: "pgvector" },
  analytics: {},
  logging: { level: "error", pretty: false, app: "spec", env: "test" },
});

export const authConfig = (
  enrolmentMode: "personal" | "bootstrap" | "invite",
): NonNullable<ContainerConfig["auth"]> => ({
  secret: "spec-secret-spec-secret-spec-secret",
  baseUrl: "http://localhost:3000",
  trustedOrigins: ["http://localhost:3000"],
  sessionMaxAgeSeconds: 604_800,
  cookieCacheMaxAgeSeconds: 60,
  requireEmailVerification: true,
  appName: "Loadbearing",
  enrolmentMode,
  bootstrapOrganizationSlug: "loadbearing",
  maxOwnedOrganizations: 3,
});

import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// The repository root, not this package: a pnpm filter runs with the package as cwd.
config({ path: new URL("../../.env", import.meta.url) });

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run the smoke suite.`);
  return value;
};

const optional = (name: string): string | undefined => process.env[name] || undefined;

const lokiUrl = optional("LOKI_URL");
const clickhouseUrl = optional("CLICKHOUSE_URL");

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: {
    include: ["tests/smoke/**/*.smoke.spec.ts"],
    // Serially: two files racing on the same bucket and the same queue key is a flake
    // that only reproduces on a fast machine.
    fileParallelism: false,
    // Real round trips to five services, and MinIO's first request pays for the pool.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The whole environment read, once, here — see `tests/smoke/support/stack.ts`.
    provide: {
      stack: {
        redis: {
          cacheUrl: required("REDIS_CACHE_URL"),
          queueUrl: required("REDIS_QUEUE_URL"),
        },
        storage: {
          endpoint: required("S3_ENDPOINT"),
          region: required("S3_REGION"),
          bucket: required("S3_BUCKET"),
          accessKey: required("S3_ACCESS_KEY"),
          secretKey: required("S3_SECRET_KEY"),
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        },
        ...(lokiUrl ? { loki: { url: lokiUrl, tenantId: optional("LOKI_TENANT_ID") } } : {}),
        ...(clickhouseUrl
          ? {
              clickhouse: {
                url: clickhouseUrl,
                database: process.env.CLICKHOUSE_DATABASE ?? "ratchet",
                username: process.env.CLICKHOUSE_USER ?? "ratchet",
                password: process.env.CLICKHOUSE_PASSWORD ?? "",
              },
            }
          : {}),
      },
    },
  },
});

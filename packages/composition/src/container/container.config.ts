import type { LogLevel } from "../import.js";

// Every value the system needs, in one shape, and none of it read from the
// environment. `apps/web/src/env.ts` and `apps/worker/src/env.ts` are the only two
// files in the repository that touch `process.env`; they parse it, validate it, and
// hand this object down.
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
  // Optional, because `apps/worker` never issues or validates a session and must not
  // carry an AUTH_SECRET it has no use for (25.2). Absent means no `AuthFactory`.
  readonly auth?: {
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

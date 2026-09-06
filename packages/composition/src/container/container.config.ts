import type { LogLevel } from "../import.js";

// Every value the system needs, in one shape, and none of it read from the environment:
// the two `env.ts` files parse it, validate it, and hand this object down.
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
    readonly appName: string;
    // Which of the three `MembershipEnroller`s this container binds. The one place in
    // the system that branches on it is `Container`, which is what a DI root is for.
    readonly enrolmentMode: "personal" | "bootstrap" | "invite";
    // Absent switches Google sign-in off. Built only when both halves are present, so
    // a half-filled `.env` disables the provider rather than failing at consent.
    readonly google?: { readonly clientId: string; readonly clientSecret: string };
    // Read only under `enrolmentMode: "bootstrap"`. The organization every sign-up
    // joins — first one in as `owner`, everyone after as `member`.
    readonly bootstrapOrganizationSlug?: string;
  };
  // Not optional: with `requireEmailVerification` on, a container that cannot send is
  // one whose sign-ups never complete. SMTP, so swapping vendors is this URL.
  readonly email: {
    readonly url: string;
    readonly from: string;
  };
  readonly embedding: {
    readonly apiKey: string;
    readonly model: string;
    readonly dimensions: number;
  };
  // ── the swappable stores ───────────────────────────────────────────────────
  // Three blocks. `vector` and `logs` name a `driver` the container switches on;
  // `analytics` has no reader to switch. See docs/reference/container.md.
  readonly vector: {
    // `pgvector` today. Rebuildable by re-embedding the sources, which is why a
    // dedicated store can be adopted without a migration plan.
    readonly driver: "pgvector";
  };
  readonly analytics: {
    // No `driver`: the projection is write-only until a feature reads it, and its
    // presence alone decides whether the pipeline exists, so nothing runs half-wired.
    readonly clickhouse?: {
      readonly url: string;
      readonly database: string;
      readonly username: string;
      readonly password: string;
    };
  };
  // Absent means no `LogReader`. Diagnostics are still written to stdout either way;
  // this only decides whether anything in-process can read them back.
  readonly logs?: {
    readonly driver: "loki";
    readonly url: string;
    // Loki's multi-tenancy header. Unset locally, set on Grafana Cloud — which is why
    // this is a config field rather than a migration.
    readonly tenantId?: string;
  };
  readonly logging: {
    readonly level: LogLevel;
    // Never true in production: Alloy wants one JSON object per line and nothing else.
    readonly pretty: boolean;
    // Two of the four log labels. Low-cardinality by construction.
    readonly app: string;
    readonly env: string;
  };
}

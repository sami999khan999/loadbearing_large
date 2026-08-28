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
    // Undefined means no automatic enrolment: an unaffiliated sign-up is refused a
    // session, which is what `MembershipReader` returning null already does. Set it
    // and a user's first session enrols them into that organization — the first one
    // in as `owner`, everyone after as `member`.
    readonly bootstrapOrganizationSlug?: string;
  };
  // Transactional mail. Not optional: `requireEmailVerification` defaults to on, and a
  // container that cannot send is a container whose sign-ups can never complete. SMTP
  // rather than a provider block, because every managed sender speaks it — swapping
  // vendors is this URL and nothing else.
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
  //
  // Three blocks, one shape. Each names a `driver`, and `Container` reads it to
  // decide which class implements the port — so adopting a store is an environment
  // variable and one `case`, never a change to a use-case, a repository, or a test.
  //
  // The `driver` field is what stops "swap the implementation" from being a claim.
  // A seam with exactly one implementation is untested by construction; a seam with
  // a discriminated config is exercised the first time somebody flips the value.
  readonly vector: {
    // `pgvector` today — physically inside Postgres, conceptually derived, and
    // rebuildable by re-embedding the source documents. That last property is the
    // whole reason a dedicated store can be adopted without a migration plan.
    //
    // A dedicated vector database is a fourth folder in
    // `packages/infrastructure/src/` and one more member of this union. Nothing
    // above `Container` learns which one is running, because `VectorStore.search()`
    // already takes the resolved goal scope as a parameter rather than reaching for
    // a `CapabilitySet` no remote store could hold.
    readonly driver: "pgvector";
  };
  readonly analytics: {
    // `postgres` reads the nightly rollup tables; `clickhouse` reads the projected
    // event stream. Same port, same two questions, same call sites.
    readonly driver: "postgres" | "clickhouse";
    // Required when the driver is `clickhouse`, ignored otherwise. Its presence is
    // also what decides whether the projection pipeline exists at all — a container
    // with no ClickHouse builds no `AnalyticsProjector`, and the worker registers no
    // projection consumer, so nothing runs half-wired.
    readonly clickhouse?: {
      readonly url: string;
      readonly database: string;
      readonly username: string;
      readonly password: string;
    };
  };
  // Absent means no `LogReader`. Diagnostics are still written — `JsonLogger` goes
  // to stdout and has never heard of a log platform — this block only decides
  // whether anything in-process can read them back.
  readonly logs?: {
    readonly driver: "loki";
    readonly url: string;
    // Loki's multi-tenancy header. Unset locally; set on Grafana Cloud, which runs
    // the identical thing and is the reason this is a config field rather than a
    // migration.
    readonly tenantId?: string;
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

// Everything this app takes from outside itself, in one place. No relative re-exports
// live here — that is what keeps it cycle-free.
//
// `env.ts` is the one file above that does not read from here: it carries the schema
// that turns the environment into a `ContainerConfig`, and it is parsed before anything
// else in the process exists.

// ── @loadbearing/application ─────────────────────────────────────────────────
// The principal a consumer runs as. `SystemPrincipal` narrows it; nothing here
// constructs a user's.
export { Principal } from "@loadbearing/application";

// ── @loadbearing/composition ─────────────────────────────────────────────────
// A value in `main.ts` and a type in every consumer and schedule, which is one line
// either way. The worker never builds an adapter itself — it asks the container.
export { Container } from "@loadbearing/composition";

// ── @loadbearing/content ─────────────────────────────────────────────────────
// The server catalog reaches this app and no other: `DigestComposer` is the only
// reader of the `email` namespace, and the ESLint ban in 05 is what keeps it that way.
export type { ContentSource, Locale } from "@loadbearing/content";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export type { OrganizationId, UserId } from "@loadbearing/contracts";

// ── @loadbearing/infrastructure ──────────────────────────────────────────────
// `QueueName` is the shared vocabulary between the publisher and this consumer, and
// `RedisConnection` is what applies `maxRetriesPerRequest: null` — a bare connection
// gets ioredis defaults and the symptom is a worker that stops consuming silently (15).
export { QueueName, RedisConnection } from "@loadbearing/infrastructure";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export { CapabilitySet, type PermissionKey, PermissionRegistry } from "@loadbearing/permissions";

// ── bullmq ───────────────────────────────────────────────────────────────────
// The queue library appears on exactly one `import.ts` in the repository, and this is
// it. A package naming it would be a package that has to run in this process.
export { type Job, Queue, Worker } from "bullmq";

// ── ioredis ──────────────────────────────────────────────────────────────────
// Type-only. Every connection is built by `RedisConnection` above.
export type { Redis } from "ioredis";

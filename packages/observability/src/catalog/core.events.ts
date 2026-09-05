import type { EventMeta } from "./index.js";

// This catalog is the cardinality budget for the `event_code` label, so codes stay
// coarse: one code carrying a `queue` field, never one code per queue.
export const coreEvents = {
  "process.started": { level: "info" },
  "process.stopping": { level: "info" },
  "process.stopped": { level: "info" },

  // Sampled: the highest-volume line this system emits, and 10 % shows a latency shift.
  // Failures below are never sampled.
  "http.request.completed": { level: "info", sample: 0.1 },
  "http.request.failed": { level: "warn" },

  "queue.job.completed": { level: "debug" },
  "queue.job.failed": { level: "error" },
  "queue.job.stalled": { level: "warn" },
  "queue.schedule.registered": { level: "info" },

  // Alert on `partitions.ensured` when `created` stays 0 for a month: the job ran and
  // the runway is not being extended.
  "maintenance.sweep.completed": { level: "info" },
  "maintenance.partitions.ensured": { level: "info" },
  "maintenance.partition.archived": { level: "info" },

  // Reconciles against Postgres rather than job history, which ages out long before a
  // nightly run.
  "queue.sweep.completed": { level: "info" },

  // The vendor body, which `UnavailableError` deliberately does not carry: a ClickHouse
  // or Loki failure echoes the offending row, and the wire is not where that belongs.
  "dependency.request.failed": { level: "warn" },

  "cache.entry.corrupt": { level: "warn" },
  "db.query.slow": { level: "warn" },
  "storage.upload.failed": { level: "error" },
  "embedding.request.failed": { level: "error" },

  // `lagged` is the one that matters: the realistic failure is a consumer that died
  // quietly, not one that threw.
  "analytics.projection.completed": { level: "debug" },
  "analytics.projection.failed": { level: "error" },
  "analytics.projection.lagged": { level: "warn" },
  "analytics.reconciliation.completed": { level: "info" },
  "analytics.reconciliation.drifted": { level: "error" },
} as const satisfies Record<string, EventMeta>;

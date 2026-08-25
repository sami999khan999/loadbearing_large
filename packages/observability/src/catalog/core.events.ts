import type { EventMeta } from "./index.js";

// Platform events. A slice adds its own `<slice>.events.ts` and one spread line in
// `catalog/index.ts`, exactly as it does for permissions and error codes.
//
// This catalog is the cardinality budget for the `event_code` log label — plus
// `ERROR_EVENT`, which is not an entry here. Codes stay coarse: one code carrying
// a `queue` field, never one code per queue.
export const coreEvents = {
  "process.started": { level: "info" },
  "process.stopping": { level: "info" },
  "process.stopped": { level: "info" },

  // Sampled: one line per request is the highest-volume thing this system emits,
  // and 10% is enough to see a latency shift. Failures below are never sampled.
  "http.request.completed": { level: "info", sample: 0.1 },
  "http.request.failed": { level: "warn" },

  "queue.job.completed": { level: "debug" },
  "queue.job.failed": { level: "error" },
  "queue.job.stalled": { level: "warn" },
  "queue.schedule.registered": { level: "info" },

  // The sweep that turns a lost job into a delay. It reconciles against Postgres
  // rather than job history, which ages out long before a nightly run.
  "queue.sweep.completed": { level: "info" },

  "cache.entry.corrupt": { level: "warn" },
  "db.query.slow": { level: "warn" },
  "storage.upload.failed": { level: "error" },
  "embedding.request.failed": { level: "error" },

  // The derived-store pipeline. `lagged` is the one that matters: the realistic
  // failure is a consumer that died quietly, not one that threw.
  "analytics.projection.completed": { level: "debug" },
  "analytics.projection.failed": { level: "error" },
  "analytics.projection.lagged": { level: "warn" },
  "analytics.reconciliation.completed": { level: "info" },
  "analytics.reconciliation.drifted": { level: "error" },
} as const satisfies Record<string, EventMeta>;

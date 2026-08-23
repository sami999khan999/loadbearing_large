import type { EventMeta } from "./index.js";

// Platform events. A slice adds its own `<slice>.events.ts` and one spread line in
// `catalog/index.ts`, exactly as it does for permissions and error codes.
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

  "cache.entry.corrupt": { level: "warn" },
  "db.query.slow": { level: "warn" },
  "storage.upload.failed": { level: "error" },
  "embedding.request.failed": { level: "error" },
} as const satisfies Record<string, EventMeta>;

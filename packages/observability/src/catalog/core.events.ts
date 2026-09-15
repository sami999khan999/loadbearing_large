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

  // `saturated` is the pool's own queue, and it is blind to a pooler in front: a wait
  // inside pgBouncer reads as zero here. See docs/infra/reference/pgbouncer.md.
  "database.pool.saturated": { level: "warn" },
  // An idle connection whose socket died — a restarted pooler, a failover. Warn, not
  // error: `pg` opens another, and the alternative to catching it is the process exiting.
  "database.pool.error": { level: "warn" },
  // The sum of what the consumers that actually started will run concurrently, against
  // the pool they share. Once at boot.
  "worker.pool.oversubscribed": { level: "warn" },

  // Do not alert on `ensured.created == 0` — that is the steady state, because the runway
  // is already three months deep. `partition.runway.low` is the signal.
  "maintenance.sweep.completed": { level: "info" },
  "maintenance.partitions.ensured": { level: "info" },
  "maintenance.partition.archived": { level: "info" },
  // Distinct from `archived`, which means detached, uploaded, verified and *then*
  // dropped. This one is a partition whose rows were never worth keeping.
  "maintenance.partition.dropped": { level: "info" },
  // Counts what exists, never what the last run created: a run that creates zero is the
  // healthy case and the starved case alike.
  "partition.runway.low": { level: "warn" },

  // The vendor body, which `UnavailableError` deliberately does not carry: a ClickHouse
  // or Loki failure echoes the offending row, and the wire is not where that belongs.
  "dependency.request.failed": { level: "warn" },

  // The transport's own reason, which `UnavailableError("smtp")` deliberately does not
  // carry. Without it a bounced invitation is a 200 and nothing else.
  "email.send.failed": { level: "error" },

  // Together these are the delivery record, because there is no delivery table. `queued`
  // and `sent` bracket a message; `failed` fires once, on the last attempt.
  "mail.delivery.queued": { level: "debug" },
  "mail.delivery.sent": { level: "info" },
  "mail.delivery.failed": { level: "error" },

  // `lagged` is the one that matters: a drain that stops running is silent otherwise,
  // because "no events published" and "no events to publish" look identical.
  "outbox.drain.completed": { level: "debug" },
  "outbox.drain.lagged": { level: "warn" },
  "outbox.delivery.failed": { level: "error" },

  "notification.digest.completed": { level: "info" },

  // A pair, not a counter: `opened` minus `closed` is the live stream count, and the
  // duration on `closed` is what says whether a client is reconnecting in a loop.
  "realtime.stream.opened": { level: "debug" },
  "realtime.stream.closed": { level: "debug" },
  "realtime.publish.failed": { level: "warn" },

  "cache.entry.corrupt": { level: "warn" },
  "embedding.request.failed": { level: "error" },

  // `lagged` is the one that matters: the realistic failure is a consumer that died
  // quietly, not one that threw.
  "analytics.projection.completed": { level: "debug" },
  "analytics.projection.failed": { level: "error" },
  "analytics.projection.lagged": { level: "warn" },
  "analytics.reconciliation.completed": { level: "info" },
  "analytics.reconciliation.drifted": { level: "error" },
} as const satisfies Record<string, EventMeta>;

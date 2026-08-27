import type { EventCode } from "../catalog/index.js";

// What a log line may carry. Same value types as `ErrorContext`, for the same
// reason: a field is something you filter on, never a sentence you read.
export type LogValue = string | number | boolean;
export type LogFields = Readonly<Record<string, LogValue>>;

// One entry per code, declaring that event's fields. Type-only, so this file adds
// nothing to the bundle — the same trick `content` uses to derive `MessageKey`.
//
// Declaring the fields is the point: a misspelling is a compile error, a dashboard
// keys on a name that cannot drift, and a token cannot be logged unless somebody
// wrote a field for it here, where a reviewer sees it.
export interface EventShape {
  readonly "process.started": { readonly service: string; readonly consumers?: number };
  readonly "process.stopping": { readonly service: string; readonly signal: string };
  readonly "process.stopped": { readonly service: string; readonly durationMs: number };

  readonly "http.request.completed": {
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
  };
  readonly "http.request.failed": {
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
  };

  readonly "queue.job.completed": {
    readonly queue: string;
    readonly jobId: string;
    readonly durationMs: number;
  };
  readonly "queue.job.failed": {
    readonly queue: string;
    readonly jobId: string;
    readonly attempt: number;
  };
  readonly "queue.job.stalled": { readonly queue: string; readonly jobId: string };
  readonly "queue.schedule.registered": { readonly queue: string; readonly jobId: string };

  readonly "maintenance.sweep.completed": {
    readonly sessions: number;
    readonly verifications: number;
  };
  readonly "maintenance.partitions.ensured": {
    readonly table: string;
    readonly created: number;
    readonly monthsAhead: number;
  };
  readonly "maintenance.partition.archived": {
    readonly period: string;
    readonly key: string;
    readonly rowCount: number;
  };
  readonly "queue.sweep.completed": {
    readonly queue: string;
    readonly found: number;
    readonly reEnqueued: number;
  };

  readonly "cache.entry.corrupt": { readonly key: string };
  readonly "db.query.slow": { readonly operation: string; readonly durationMs: number };
  readonly "storage.upload.failed": { readonly bucket: string; readonly key: string };
  readonly "embedding.request.failed": { readonly model: string; readonly chunks: number };

  readonly "analytics.projection.completed": {
    readonly projection: string;
    readonly events: number;
    readonly durationMs: number;
  };
  readonly "analytics.projection.failed": {
    readonly projection: string;
    readonly eventId: string;
  };
  readonly "analytics.projection.lagged": {
    readonly projection: string;
    readonly pending: number;
    readonly lagSeconds: number;
  };
  readonly "analytics.reconciliation.completed": {
    readonly days: number;
    readonly durationMs: number;
  };
  readonly "analytics.reconciliation.drifted": {
    readonly day: string;
    readonly expected: number;
    readonly actual: number;
  };
}

export type EventFields<C extends EventCode> = EventShape[C];

// The wire format. One of these becomes one line of JSON on stdout.
export interface LogEntry {
  readonly level: string;
  readonly time: string;
  readonly event: EventCode | "error.raised";
  readonly fields: LogFields;
}

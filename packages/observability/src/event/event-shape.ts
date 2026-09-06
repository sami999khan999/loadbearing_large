import type { EventCode } from "../catalog/index.js";

// What a log line may carry. Same value types as `ErrorContext`, for the same
// reason: a field is something you filter on, never a sentence you read.
export type LogValue = string | number | boolean;
export type LogFields = Readonly<Record<string, LogValue>>;

// One entry per code, type-only. Declaring the fields is the point: a token cannot be
// logged unless somebody wrote a field for it here, where a reviewer sees it.
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
  readonly "dependency.request.failed": {
    readonly dependency: string;
    readonly status: number;
    // Truncated at the call site. The one field here that is read rather than
    // filtered on, because a vendor body is the whole diagnostic.
    readonly detail: string;
  };

  // No recipient: the address is what the failing send was about, and a log line is
  // not where it belongs. The reason is truncated at the call site.
  readonly "email.send.failed": { readonly reason: string };

  readonly "cache.entry.corrupt": { readonly key: string };
  readonly "embedding.request.failed": { readonly model: string; readonly chunks: number };

  readonly "analytics.projection.completed": {
    readonly projection: string;
    readonly events: number;
    readonly durationMs: number;
    // On the success line, not only the warning one: a field that appears only when
    // something is wrong has no baseline to be wrong against.
    readonly lagSeconds: number;
    // True when the run stopped at its batch ceiling rather than because it caught up —
    // which separates "behind and closing" from "behind every run for a week".
    readonly capped: boolean;
  };
  readonly "analytics.projection.failed": {
    readonly projection: string;
    readonly eventId: string;
  };
  readonly "analytics.projection.lagged": {
    readonly projection: string;
    readonly lagSeconds: number;
    // The threshold that fired, so the line explains itself without the reader having
    // to find the constant.
    readonly thresholdSeconds: number;
  };
  readonly "analytics.reconciliation.completed": {
    readonly days: number;
    readonly durationMs: number;
  };
  // One line per drifting day, not one listing them: a field is something you filter on,
  // and a day is the grain an operator groups by.
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

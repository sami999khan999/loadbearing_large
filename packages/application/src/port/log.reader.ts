// One diagnostic line, as the log platform returns it. `fields` is whatever the line
// carried beyond the four labels — correlation id, trace id, tenant, duration.
export interface LogEntry {
  readonly timestamp: Date;
  readonly app: string;
  readonly env: string;
  readonly level: string;
  readonly eventCode: string;
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

// What a caller may filter on, and the list is closed on purpose.
//
// The four labels are the only fields the log platform indexes; everything else lives
// in the line body and is filtered after the selector has narrowed the streams. A
// `userId` promoted to a label creates one stream per user and is the single most
// common way a Loki deployment falls over — so the port does not offer the shape.
export interface LogQuery {
  readonly from: Date;
  readonly to: Date;
  readonly app?: string;
  readonly env?: string;
  readonly level?: string;
  readonly eventCode?: string;
  // Matched against the line body, never against a label. This is where a trace id,
  // a correlation id or an organization id belongs.
  readonly contains?: string;
  readonly limit?: number;
}

// Reading diagnostics back. Deliberately read-only and deliberately not on the write
// path: `JsonLogger` writes to stdout and has never heard of a log platform, which is
// what keeps it a Tier 0 dependency and the platform swap a config change.
//
// This port exists for the operator surface — the one reader that knows what an
// organization is, which is the one thing a generic log console cannot know. It is
// absent from a container built without a log platform configured, because a reader
// that silently returns nothing is worse than one that is honestly not there.
export abstract class LogReader {
  public abstract query(query: LogQuery): Promise<readonly LogEntry[]>;

  public abstract healthy(): Promise<boolean>;
}

const EMBEDDING = "embedding";
const NOTIFICATION = "notification";
const DOCUMENT = "document";
const ANALYTICS = "analytics";
const MAINTENANCE = "maintenance";

// Frozen at module load rather than left as a `static readonly`: the keyword freezes the
// binding and not the array, which is the shape `docs/ai/rules/classes.md` bans.
const ALL = Object.freeze([EMBEDDING, NOTIFICATION, DOCUMENT, ANALYTICS, MAINTENANCE] as const);

// A handful of queues by concern, not one per job type. A queue is a concurrency
// and priority boundary: embedding is slow and rate-limited, notifications bursty.
export class QueueName {
  private constructor() {}

  public static readonly EMBEDDING = EMBEDDING;
  public static readonly NOTIFICATION = NOTIFICATION;
  public static readonly DOCUMENT = DOCUMENT;
  // Its own concern because it is allowed to fall behind — nobody waits on a
  // dashboard row, and its depth is the health signal for the derived store.
  public static readonly ANALYTICS = ANALYTICS;
  public static readonly MAINTENANCE = MAINTENANCE;

  public static readonly ALL = ALL;
}

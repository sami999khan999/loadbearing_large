// A handful of queues by concern, not one per job type. A queue is a concurrency
// and priority boundary: embedding is slow and rate-limited, notifications bursty.
export class QueueName {
  private constructor() {}

  public static readonly EMBEDDING = "embedding";
  public static readonly NOTIFICATION = "notification";
  public static readonly DOCUMENT = "document";
  // Its own concern because it is allowed to fall behind — nobody waits on a
  // dashboard row, and its depth is the health signal for the derived store.
  public static readonly ANALYTICS = "analytics";
  public static readonly MAINTENANCE = "maintenance";

  public static readonly ALL = [
    QueueName.EMBEDDING,
    QueueName.NOTIFICATION,
    QueueName.DOCUMENT,
    QueueName.ANALYTICS,
    QueueName.MAINTENANCE,
  ] as const;
}

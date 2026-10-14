import { ValidationError } from "../import.js";
import { type QueueKey, QueueLimits } from "../primitive/index.js";

// The checks every worker-control write shares: a queue name that is a queue, and a
// queue list a process can actually run.
export class WorkerControlRules {
  private constructor() {}

  public static queue(name: string, field = "queue"): QueueKey {
    if (!QueueLimits.isQueue(name)) throw new ValidationError([{ field, rule: "unknown" }]);
    return name;
  }

  public static queueList(names: readonly string[]): readonly QueueKey[] {
    if (names.length === 0) throw new ValidationError([{ field: "queues", rule: "required" }]);
    const unique = [...new Set(names)];
    return unique.map((name) => WorkerControlRules.queue(name, "queues"));
  }
}

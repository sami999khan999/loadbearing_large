import { QueueName } from "../import.js";

export type QueueKey = (typeof QueueName.ALL)[number];

// The most any one process may run of each queue, whatever the environment asks for. These
// are ceilings, not defaults: the starting values are the `WORKER_<Q>_CONCURRENCY` variables.
const LIMITS: Readonly<Record<QueueKey, number>> = Object.freeze({
  [QueueName.EMBEDDING]: 32,
  [QueueName.NOTIFICATION]: 16,
  // One writer is the correctness argument, not a tuning choice — see `env.ts`.
  [QueueName.ANALYTICS]: 1,
  // Table-level locks. A handful is the most that is ever safe on one partition set.
  [QueueName.MAINTENANCE]: 4,
  [QueueName.MAIL]: 32,
  [QueueName.EVENT]: 64,
});

export class QueueLimits {
  private constructor() {}

  public static maxFor(queue: QueueKey): number {
    return LIMITS[queue];
  }

  public static isQueue(name: string): name is QueueKey {
    return (QueueName.ALL as readonly string[]).includes(name);
  }
}

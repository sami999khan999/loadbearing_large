import { QueueControlGateway, type QueueCounts } from "../import.js";

// Waiting counts a spec sets by hand, and the pause set the use-cases write.
export class InMemoryQueueControlGateway extends QueueControlGateway {
  public readonly waiting = new Map<string, number>();
  public readonly paused = new Set<string>();

  public override counts(queues: readonly string[]): Promise<readonly QueueCounts[]> {
    return Promise.resolve(
      queues.map((queue) => ({
        queue,
        waiting: this.waiting.get(queue) ?? 0,
        active: 0,
        delayed: 0,
        failed: 0,
        paused: this.paused.has(queue),
      })),
    );
  }

  public override pause(queue: string): Promise<void> {
    this.paused.add(queue);
    return Promise.resolve();
  }

  public override resume(queue: string): Promise<void> {
    this.paused.delete(queue);
    return Promise.resolve();
  }
}

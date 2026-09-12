import { type JobOptions, Queue, QueuePublisher, type Redis } from "../import.js";

export class BullMqQueuePublisher extends QueuePublisher {
  private readonly queues = new Map<string, Queue>();

  public constructor(private readonly connection: Redis) {
    super();
  }

  public override async publish<T>(queue: string, payload: T, options?: JobOptions): Promise<void> {
    // The queue name is the default job name, which is what a queue carrying one kind
    // of work wants; a consumer that switches on `job.name` passes its own.
    await this.queueFor(queue).add(options?.name ?? queue, payload, {
      delay: options?.delayMs,
      attempts: options?.attempts ?? 3,
      priority: options?.priority,
      // The deduplication key, from the port: "enqueue OCR for this receipt, once"
      // is a business rule, not queue configuration.
      jobId: options?.jobId,
      // A service that is down does not recover faster for three retries in two seconds.
      backoff: { type: "exponential", delay: 2_000 },
      // Mandatory, not tuning. BullMQ keeps completed jobs forever by default, and
      // on a `noeviction` instance that ends with everything stopping.
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    });
  }

  private queueFor(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const created = new Queue(name, { connection: this.connection });
    this.queues.set(name, created);
    return created;
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}

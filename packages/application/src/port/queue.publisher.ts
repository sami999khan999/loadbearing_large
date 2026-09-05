export interface JobOptions {
  readonly delayMs?: number;
  readonly attempts?: number;
  // Deduplication key: idempotency is a domain rule ("enqueue OCR for this receipt,
  // once"), not queue configuration.
  readonly jobId?: string;
}

export abstract class QueuePublisher {
  public abstract publish<T>(queue: string, payload: T, options?: JobOptions): Promise<void>;
}

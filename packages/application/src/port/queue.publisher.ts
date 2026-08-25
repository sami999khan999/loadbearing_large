export interface JobOptions {
  readonly delayMs?: number;
  readonly attempts?: number;
  // Deduplication key — a second publish with the same id is a no-op. Idempotency is a
  // domain rule ("enqueue OCR for this receipt, once"), not queue configuration.
  readonly jobId?: string;
}

export abstract class QueuePublisher {
  public abstract publish<T>(queue: string, payload: T, options?: JobOptions): Promise<void>;
}

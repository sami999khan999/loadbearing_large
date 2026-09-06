export interface JobOptions {
  readonly delayMs?: number;
  readonly attempts?: number;
  // Idempotency is a domain rule ("enqueue OCR for this receipt, once"), not queue
  // configuration. **No `:`** — BullMQ keys on it and rejects the job at publish time.
  readonly jobId?: string;
}

export abstract class QueuePublisher {
  public abstract publish<T>(queue: string, payload: T, options?: JobOptions): Promise<void>;
}

import { type Container, type Job, QueueName, type Redis, Worker } from "../import.js";
import { SystemPrincipal } from "../system-principal.js";

interface EmbeddingJobData {
  readonly organizationId: string;
  readonly documentId: string;
  readonly text: string;
  readonly goalId?: string | null;
  readonly sourceType?: string;
}

// A thin adapter, exactly like an oRPC router. Everything worth testing lives in
// `IndexDocumentUseCase`.
export class EmbeddingConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
  ) {}

  public start(): Worker {
    const worker = new Worker<EmbeddingJobData>(
      QueueName.EMBEDDING,
      async (job: Job<EmbeddingJobData>) => this.handle(job),
      { connection: this.connection, concurrency: this.concurrency },
    );

    // From the event, never a `catch` in the handler: the listener does not swallow, so
    // BullMQ still sees the rejection and still retries.
    worker.on("failed", (job, error) => {
      this.container.logger.failure(error, {
        queue: QueueName.EMBEDDING,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });
    });

    worker.on("completed", (job) => {
      this.container.logger.emit("queue.job.completed", {
        queue: QueueName.EMBEDDING,
        jobId: job.id ?? "unknown",
        durationMs: Math.max(0, (job.finishedOn ?? 0) - (job.processedOn ?? 0)),
      });
    });

    worker.on("stalled", (jobId) => {
      this.container.logger.emit("queue.job.stalled", { queue: QueueName.EMBEDDING, jobId });
    });

    return worker;
  }

  // Let it throw: BullMQ's retry is driven by rejection, so catching here turns a
  // retryable failure into permanent, silent data loss.
  public async handle(job: Job<EmbeddingJobData>): Promise<void> {
    const principal = SystemPrincipal.forOrganization(job.data.organizationId);

    await this.container.ai.indexDocument.execute(principal, {
      documentId: job.data.documentId,
      text: job.data.text,
      goalId: job.data.goalId ?? null,
      sourceType: job.data.sourceType ?? "document",
    });
  }
}

import { Uuid, ValidationError } from "../import.js";
import type { QueuePublisher } from "../port/index.js";
import { type Authorizer, type Principal, QueueName } from "../primitive/index.js";

export interface QueueDocumentIndexInput {
  // Optional: a caller re-indexing an existing document supplies its id, and a caller
  // pasting new text does not.
  readonly documentId?: string;
  readonly text: string;
  readonly goalId?: string | null;
  readonly sourceType?: string;
}

export interface QueuedDocumentIndex {
  readonly documentId: string;
}

// Embedding is a network round trip per document and is rate-limited by the provider,
// so the request enqueues and returns rather than holding a connection open for it.
export class QueueDocumentIndexUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly queue: QueuePublisher,
  ) {}

  public async execute(
    actor: Principal,
    input: QueueDocumentIndexInput,
  ): Promise<QueuedDocumentIndex> {
    // The same key `IndexDocumentUseCase` asserts when the consumer runs it. Checked
    // here too: a job that will be refused should never reach the queue.
    this.authorizer.assert(actor, "ai.embedding.write");

    if (input.text.trim().length === 0) {
      throw new ValidationError([{ field: "text", rule: "required" }]);
    }

    const documentId = input.documentId ?? Uuid.v7();

    await this.queue.publish(
      QueueName.EMBEDDING,
      {
        organizationId: actor.organizationId,
        documentId,
        text: input.text,
        goalId: input.goalId ?? null,
        sourceType: input.sourceType ?? "document",
      },
      // Keyed on the tenant *and* the document: two organizations re-indexing documents
      // that happen to share an id must not collapse into one job. `_`, never `:`.
      { jobId: `${actor.organizationId}_${documentId}` },
    );

    return { documentId };
  }
}

import { Uuid, ValidationError } from "../import.js";
import type { ActivityLogger, EmbeddingProvider, UnitOfWork, VectorStore } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";

export interface IndexDocumentInput {
  readonly documentId: string;
  readonly text: string;
  // Null means the document is org-wide within this organization, never across them.
  readonly goalId?: string | null;
  readonly sourceType?: string;
}

export interface IndexDocumentResult {
  readonly documentId: string;
  readonly chunks: number;
}

// Characters, not tokens. A token count needs the model's tokeniser, which is a
// provider concern; this is the coarse bound that keeps a batch inside a request.
const CHUNK_SIZE = 1_500;
const CHUNK_OVERLAP = 200;

// LOAD → AUTHORIZE → WORK → PERSIST. Callable from an oRPC router and from the
// worker's consumer, and the `Authorizer.assert()` below is the gate in both.
export class IndexDocumentUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly embeddings: EmbeddingProvider,
    private readonly vectors: VectorStore,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  public async execute(actor: Principal, input: IndexDocumentInput): Promise<IndexDocumentResult> {
    this.authorizer.assert(actor, "ai.embedding.write");
    this.authorizer.assert(actor, "core.activity.write");

    const texts = IndexDocumentUseCase.split(input.text);
    if (texts.length === 0) {
      throw new ValidationError([{ field: "text", rule: "required" }]);
    }

    // One round trip for the whole document. A per-chunk call is what turns a
    // re-index into a rate-limit incident.
    const vectors = await this.embeddings.embed(texts);

    const chunks = texts.map((content, index) => ({
      id: Uuid.v7(),
      sourceId: input.documentId,
      goalId: input.goalId ?? null,
      content,
      embedding: vectors[index] ?? [],
      metadata: {
        sourceType: input.sourceType ?? "document",
        chunkIndex: index,
      },
    }));

    // Replace rather than merge, in one transaction: a re-index of shortened text must
    // not leave the chunks it no longer has.
    await this.unitOfWork.run(async () => {
      await this.vectors.deleteBySource(actor.organizationId, input.documentId);
      await this.vectors.upsert(actor.organizationId, chunks);
      await this.activity.record(actor, "ai.document.indexed", {
        documentId: input.documentId,
        chunks: chunks.length,
      });
    });

    return { documentId: input.documentId, chunks: chunks.length };
  }

  // Fixed-width windows with an overlap, so a sentence straddling a boundary is
  // retrievable from either side. Not sentence-aware: that is a model's job.
  private static split(text: string): readonly string[] {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];

    const stride = CHUNK_SIZE - CHUNK_OVERLAP;
    const out: string[] = [];

    for (let start = 0; start < trimmed.length; start += stride) {
      const slice = trimmed.slice(start, start + CHUNK_SIZE).trim();
      if (slice.length > 0) out.push(slice);
      if (start + CHUNK_SIZE >= trimmed.length) break;
    }

    return out;
  }
}

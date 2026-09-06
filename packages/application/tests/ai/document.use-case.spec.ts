import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError, UnavailableError, ValidationError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { beforeEach, describe, expect, it } from "vitest";
import { QueueDocumentIndexUseCase } from "../../src/ai/queue-document-index.use-case.js";
import { SearchDocumentsUseCase } from "../../src/ai/search-documents.use-case.js";
import type {
  ActivityLogger,
  EmbeddingProvider,
  JobOptions,
  QueuePublisher,
  SearchHit,
  VectorStore,
} from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

function actorHolding(...grants: readonly PermissionKey[]): Principal {
  return new Principal(
    ORG,
    ACTOR,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );
}

class RecordingQueue implements QueuePublisher {
  public readonly published: { queue: string; payload: unknown; options?: JobOptions }[] = [];

  public publish<T>(queue: string, payload: T, options?: JobOptions): Promise<void> {
    this.published.push({ queue, payload, options });
    return Promise.resolve();
  }
}

class StubEmbeddings implements EmbeddingProvider {
  public readonly dimensions: number;

  public constructor(private readonly vectors: readonly (readonly number[])[]) {
    // Read off the vectors rather than fixed at 1536, so the double cannot claim a width
    // its own answers do not have.
    this.dimensions = vectors[0]?.length ?? 0;
  }

  public embed(): Promise<readonly (readonly number[])[]> {
    return Promise.resolve(this.vectors);
  }
}

class RecordingVectors implements VectorStore {
  public readonly searches: { goalIds: readonly string[]; limit: number }[] = [];

  public constructor(private readonly hits: readonly SearchHit[] = []) {}

  public upsert(): Promise<void> {
    throw new Error("not under test");
  }

  public deleteBySource(): Promise<void> {
    throw new Error("not under test");
  }

  public search(
    _org: unknown,
    _embedding: readonly number[],
    goalIds: readonly string[],
    limit: number,
  ): Promise<readonly SearchHit[]> {
    this.searches.push({ goalIds, limit });
    return Promise.resolve(this.hits);
  }
}

class RecordingActivityLogger implements ActivityLogger {
  public readonly records: { action: string; payload: Record<string, unknown> }[] = [];

  public record(
    _actor: Principal,
    action: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.records.push({ action, payload: { ...payload } });
    return Promise.resolve();
  }
}

let queue: RecordingQueue;
let activity: RecordingActivityLogger;

beforeEach(() => {
  queue = new RecordingQueue();
  activity = new RecordingActivityLogger();
});

describe("QueueDocumentIndexUseCase", () => {
  const useCase = () => new QueueDocumentIndexUseCase(new Authorizer(), queue);

  it("refuses a principal without ai.embedding.write", async () => {
    await expect(
      useCase().execute(actorHolding("ai.embedding.read"), { text: "hello" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(queue.published).toEqual([]);
  });

  it("publishes to the embedding queue with the tenant on the payload", async () => {
    const result = await useCase().execute(actorHolding("ai.embedding.write"), {
      text: "a document",
    });

    expect(queue.published).toHaveLength(1);
    expect(queue.published[0]?.queue).toBe("embedding");
    expect(queue.published[0]?.payload).toMatchObject({
      organizationId: ORG,
      documentId: result.documentId,
      text: "a document",
    });
  });

  // Two tenants re-indexing documents that happen to share an id must not collapse into
  // one job — a dedup key of the document id alone would drop one of them silently.
  it("keys deduplication on the tenant as well as the document", async () => {
    await useCase().execute(actorHolding("ai.embedding.write"), {
      documentId: "doc-1",
      text: "a document",
    });

    expect(queue.published[0]?.options?.jobId).toBe(`${ORG}_doc-1`);
  });

  // A `:` separator reached the queue once and BullMQ refused the job at publish time,
  // as a 500 — the recording fake had accepted it happily.
  it("keys deduplication with a separator BullMQ accepts", async () => {
    await useCase().execute(actorHolding("ai.embedding.write"), {
      documentId: "doc-1",
      text: "a document",
    });

    expect(queue.published[0]?.options?.jobId).not.toContain(":");
  });

  it("refuses text that is only whitespace", async () => {
    await expect(
      useCase().execute(actorHolding("ai.embedding.write"), { text: "   \n  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("SearchDocumentsUseCase", () => {
  const useCase = (vectors: RecordingVectors, embeddings: EmbeddingProvider) =>
    new SearchDocumentsUseCase(new Authorizer(), embeddings, vectors, activity);

  it("refuses a principal without ai.embedding.read", async () => {
    const vectors = new RecordingVectors();
    await expect(
      useCase(vectors, new StubEmbeddings([[1, 0]])).execute(actorHolding("ai.embedding.write"), {
        query: "anything",
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(vectors.searches).toEqual([]);
  });

  // An empty scope means org-wide chunks only, which `PgVectorStore` enforces. What is
  // pinned here is that the use-case resolves it rather than passing the input through.
  it("searches the org-wide corpus when no goals are named", async () => {
    const vectors = new RecordingVectors();
    await useCase(vectors, new StubEmbeddings([[1, 0]])).execute(
      actorHolding("ai.embedding.read"),
      { query: "invoices", limit: 5 },
    );

    expect(vectors.searches).toEqual([{ goalIds: [], limit: 5 }]);
  });

  // A provider that answered with nothing would otherwise search on `undefined` and
  // return the corpus ordered by an accident.
  it("refuses to search when the provider returns no vector", async () => {
    const vectors = new RecordingVectors();
    await expect(
      useCase(vectors, new StubEmbeddings([])).execute(actorHolding("ai.embedding.read"), {
        query: "invoices",
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(UnavailableError);
    expect(vectors.searches).toEqual([]);
  });

  it("refuses a blank query before it costs an embedding", async () => {
    const vectors = new RecordingVectors();
    await expect(
      useCase(vectors, new StubEmbeddings([[1, 0]])).execute(actorHolding("ai.embedding.read"), {
        query: "   ",
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // What someone searched for is the question an audit asks after a leak, so the query
  // text is part of the record rather than just a count.
  it("records the search with its query", async () => {
    const vectors = new RecordingVectors([
      { id: "c1", sourceId: "doc-1", content: "…", score: 0.9, metadata: {} },
    ]);

    const hits = await useCase(vectors, new StubEmbeddings([[1, 0]])).execute(
      actorHolding("ai.embedding.read"),
      { query: "invoices", limit: 5 },
    );

    expect(hits).toHaveLength(1);
    expect(activity.records).toEqual([
      { action: "ai.document.searched", payload: { query: "invoices", hits: 1 } },
    ]);
  });
});

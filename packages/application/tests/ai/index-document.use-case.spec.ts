import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError, UnavailableError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { IndexDocumentUseCase } from "../../src/ai/index-document.use-case.js";
import type {
  ActivityLogger,
  EmbeddingProvider,
  UnitOfWork,
  VectorStore,
} from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const DOCUMENT = "018f8c00-0000-7000-8000-0000000000d1";

const actorHolding = (...grants: readonly PermissionKey[]) =>
  new Principal(
    ORG,
    USER,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );

// Records what reached the store, and in which order — the ordering is the property
// worth pinning, because `deleteBySource` runs before `upsert`.
class RecordingVectorStore implements VectorStore {
  public readonly calls: string[] = [];
  public upserted: readonly { readonly embedding: readonly number[] }[] = [];

  public upsert(_organizationId: typeof ORG, chunks: readonly never[]): Promise<void> {
    this.calls.push("upsert");
    this.upserted = chunks;
    return Promise.resolve();
  }

  public deleteBySource(): Promise<void> {
    this.calls.push("delete");
    return Promise.resolve();
  }

  public search(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }
}

class StubEmbeddingProvider implements EmbeddingProvider {
  public readonly dimensions = 4;

  public constructor(private readonly howMany: (texts: readonly string[]) => number) {}

  public embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    return Promise.resolve(
      Array.from({ length: this.howMany(texts) }, (_, i) => [i, 0, 0, 0] as readonly number[]),
    );
  }
}

const recordingActivity = () => {
  const actions: string[] = [];
  return {
    actions,
    logger: {
      record: (_actor: unknown, action: string) => {
        actions.push(action);
        return Promise.resolve();
      },
    },
  };
};

// Runs the work and opens nothing. Atomicity is asserted against Postgres.
const directUnitOfWork: UnitOfWork = { run: (work) => work() } as UnitOfWork;

const build = (embeddings: EmbeddingProvider, vectors = new RecordingVectorStore()) => {
  const activity = recordingActivity();
  const useCase = new IndexDocumentUseCase(
    new Authorizer(),
    embeddings,
    vectors as unknown as VectorStore,
    activity.logger as unknown as ActivityLogger,
    directUnitOfWork,
  );
  return { useCase, vectors, activity };
};

const grants: readonly PermissionKey[] = ["ai.embedding.write", "core.activity.write"];

describe("IndexDocumentUseCase", () => {
  it("chunks the text and writes one embedding per chunk", async () => {
    const { useCase, vectors, activity } = build(new StubEmbeddingProvider((t) => t.length));

    const result = await useCase.execute(actorHolding(...grants), {
      documentId: DOCUMENT,
      text: "a".repeat(2_400),
    });

    expect(result.chunks).toBeGreaterThan(1);
    expect(vectors.upserted).toHaveLength(result.chunks);
    expect(vectors.calls).toEqual(["delete", "upsert"]);
    expect(activity.actions).toEqual(["ai.document.indexed"]);
  });

  // The regression guard: `vectors[index] ?? []` padded a short response with empties
  // that `vector(1536)` rejects — *after* `deleteBySource` had run.
  it("refuses a response with fewer vectors than texts, before deleting anything", async () => {
    const { useCase, vectors } = build(new StubEmbeddingProvider((t) => t.length - 1));

    await expect(
      useCase.execute(actorHolding(...grants), { documentId: DOCUMENT, text: "a".repeat(2_400) }),
    ).rejects.toThrow(UnavailableError);

    expect(vectors.calls).toEqual([]);
  });

  it("refuses a longer response too", async () => {
    const { useCase, vectors } = build(new StubEmbeddingProvider((t) => t.length + 1));

    await expect(
      useCase.execute(actorHolding(...grants), { documentId: DOCUMENT, text: "a".repeat(2_400) }),
    ).rejects.toThrow(UnavailableError);

    expect(vectors.calls).toEqual([]);
  });

  it("denies before reading, and before embedding", async () => {
    let embedded = false;
    const provider = new StubEmbeddingProvider((t) => {
      embedded = true;
      return t.length;
    });
    const { useCase, vectors } = build(provider);

    await expect(
      useCase.execute(actorHolding(), { documentId: DOCUMENT, text: "hello" }),
    ).rejects.toThrow(ForbiddenError);

    expect(embedded).toBe(false);
    expect(vectors.calls).toEqual([]);
  });
});

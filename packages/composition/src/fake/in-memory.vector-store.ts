import { type DocumentChunk, type OrganizationId, type SearchHit, VectorStore } from "../import.js";

// Chunks in a Map, keyed by tenant. Cosine is computed for real — a fake that scored
// every hit the same would make "the top result is the right one" pass either way,
// which is the one assertion a retrieval use-case is worth testing for.
export class InMemoryVectorStore extends VectorStore {
  private readonly chunks = new Map<string, DocumentChunk[]>();

  public override upsert(
    organizationId: OrganizationId,
    chunks: readonly DocumentChunk[],
  ): Promise<void> {
    const existing = this.chunks.get(organizationId) ?? [];
    const incoming = new Set(chunks.map((chunk) => chunk.id));
    this.chunks.set(organizationId, [
      ...existing.filter((chunk) => !incoming.has(chunk.id)),
      ...chunks,
    ]);
    return Promise.resolve();
  }

  public override deleteBySource(organizationId: OrganizationId, sourceId: string): Promise<void> {
    const existing = this.chunks.get(organizationId) ?? [];
    this.chunks.set(
      organizationId,
      existing.filter((chunk) => chunk.sourceId !== sourceId),
    );
    return Promise.resolve();
  }

  // `goalIds` filters the input set, before scoring — the same order the real store
  // uses, and the reason it matters: filtering after retrieval means the model already
  // saw what the actor cannot.
  public override search(
    organizationId: OrganizationId,
    embedding: readonly number[],
    goalIds: readonly string[],
    limit: number,
  ): Promise<readonly SearchHit[]> {
    const permitted = (this.chunks.get(organizationId) ?? []).filter(
      (chunk) => chunk.goalId === null || goalIds.includes(chunk.goalId),
    );

    const hits = permitted
      .map((chunk) => ({
        id: chunk.id,
        sourceId: chunk.sourceId,
        content: chunk.content,
        score: InMemoryVectorStore.cosine(embedding, chunk.embedding),
        metadata: chunk.metadata,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return Promise.resolve(hits);
  }

  public countFor(organizationId: OrganizationId): number {
    return (this.chunks.get(organizationId) ?? []).length;
  }

  private static cosine(left: readonly number[], right: readonly number[]): number {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let i = 0; i < left.length; i += 1) {
      const a = left[i] ?? 0;
      const b = right[i] ?? 0;
      dot += a * b;
      leftNorm += a * a;
      rightNorm += b * b;
    }

    const magnitude = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
    return magnitude === 0 ? 0 : dot / magnitude;
  }
}

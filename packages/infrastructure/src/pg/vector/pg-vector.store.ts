import {
  and,
  cosineDistance,
  type DocumentChunk,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  type OrganizationId,
  or,
  type SearchHit,
  sql,
  type VectorStore,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { documentChunks } from "../schema/index.js";

// `metadata` is an untyped bag, so these two NOT NULL columns are read out of it
// defensively. `String(unknown)` would write "[object Object]" and never throw.
const asText = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const asInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;

export class PgVectorStore extends BaseRepository implements VectorStore {
  // Vector search always returns `limit` rows however bad. Without a floor an
  // unrelated question retrieves the least-unrelated documents in the corpus.
  private static readonly MIN_SCORE = 0.3;

  public async upsert(
    organizationId: OrganizationId,
    chunks: readonly DocumentChunk[],
  ): Promise<void> {
    if (chunks.length === 0) return;

    await this.db
      .insert(documentChunks)
      .values(
        chunks.map((chunk) => ({
          id: chunk.id,
          organizationId,
          sourceId: chunk.sourceId,
          sourceType: asText(chunk.metadata.sourceType, "unknown"),
          goalId: chunk.goalId,
          chunkIndex: asInt(chunk.metadata.chunkIndex, 0),
          content: chunk.content,
          embedding: [...chunk.embedding],
          metadata: { ...chunk.metadata },
        })),
      )
      .onConflictDoUpdate({
        target: documentChunks.id,
        set: {
          content: sql`excluded.content`,
          embedding: sql`excluded.embedding`,
          metadata: sql`excluded.metadata`,
        },
      });
  }

  // The tenant predicate is here too. A delete keyed only on a caller-supplied
  // sourceId is a cross-tenant write, and nothing comes back looking wrong.
  public async deleteBySource(organizationId: OrganizationId, sourceId: string): Promise<void> {
    await this.db
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.organizationId, organizationId),
          eq(documentChunks.sourceId, sourceId),
        ),
      );
  }

  public async search(
    organizationId: OrganizationId,
    embedding: readonly number[],
    goalIds: readonly string[],
    limit: number,
  ): Promise<readonly SearchHit[]> {
    const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embedding, [...embedding])})`;

    // An empty scope means org-wide chunks only, never everything. If it meant "no
    // filter", a bug that fails to compute the permitted set would grant the corpus.
    const scope =
      goalIds.length > 0
        ? or(isNull(documentChunks.goalId), inArray(documentChunks.goalId, [...goalIds]))
        : isNull(documentChunks.goalId);

    return this.db
      .select({
        id: documentChunks.id,
        sourceId: documentChunks.sourceId,
        content: documentChunks.content,
        score: similarity,
        metadata: documentChunks.metadata,
      })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.organizationId, organizationId),
          scope,
          gt(similarity, PgVectorStore.MIN_SCORE),
        ),
      )
      .orderBy(desc(similarity))
      .limit(limit);
  }
}

import type { OrganizationId } from "../import.js";

export interface DocumentChunk {
  readonly id: string;
  readonly sourceId: string;
  readonly goalId: string | null;
  readonly content: string;
  readonly embedding: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SearchHit {
  readonly id: string;
  readonly sourceId: string;
  readonly content: string;
  readonly score: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export abstract class VectorStore {
  public abstract upsert(
    organizationId: OrganizationId,
    chunks: readonly DocumentChunk[],
  ): Promise<void>;

  public abstract deleteBySource(organizationId: OrganizationId, sourceId: string): Promise<void>;

  // `goalIds` is required so the permission filter runs on the input set, before
  // retrieval — filtering results means the model already saw what the actor cannot.
  public abstract search(
    organizationId: OrganizationId,
    embedding: readonly number[],
    goalIds: readonly string[],
    limit: number,
  ): Promise<readonly SearchHit[]>;
}

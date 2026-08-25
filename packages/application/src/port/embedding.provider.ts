export abstract class EmbeddingProvider {
  public abstract readonly dimensions: number;

  // Batched by construction: one round trip per call, never one per text. A
  // single-string signature is the shape that turns a re-index into a thousand requests.
  public abstract embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

import { EmbeddingProvider, type Logger, UnavailableError } from "../import.js";

export interface OpenAiEmbeddingConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly dimensions: number;
  readonly endpoint?: string;
}

interface EmbeddingResponse {
  readonly data: readonly { readonly index: number; readonly embedding: number[] }[];
}

export class OpenAiEmbeddingProvider extends EmbeddingProvider {
  private static readonly MAX_BATCH = 96;

  public override readonly dimensions: number;

  // Optional, like `LokiLogReader`'s: the vendor's own reason belongs in the log and
  // never on the wire, and a provider built without one still works.
  public constructor(
    private readonly config: OpenAiEmbeddingConfig,
    private readonly logger?: Logger,
  ) {
    super();
    this.dimensions = config.dimensions;
  }

  // `fetch`, not the OpenAI SDK: one dependency fewer, and the request shape is
  // stable. Wanting the SDK's retries later is a change inside this class.
  public override async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    const out: (readonly number[])[] = [];

    for (let i = 0; i < texts.length; i += OpenAiEmbeddingProvider.MAX_BATCH) {
      const batch = texts.slice(i, i + OpenAiEmbeddingProvider.MAX_BATCH);
      const response = await fetch(
        `${this.config.endpoint ?? "https://api.openai.com/v1"}/embeddings`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            dimensions: this.config.dimensions,
            input: batch,
          }),
        },
      );

      // UNAVAILABLE, not INTERNAL: the catalog marks it retryable, which is what
      // lets the embedding consumer try again instead of dead-lettering a blip.
      if (!response.ok) {
        this.fail(batch.length);
        throw new UnavailableError("openai.embeddings", response.status);
      }

      const body = (await response.json()) as EmbeddingResponse;

      // One vector per text, or the alignment below is a lie. A short response would
      // otherwise be padded with empties that `vector(1536)` rejects at insert time.
      if (body.data.length !== batch.length) {
        this.fail(batch.length);
        throw new UnavailableError("openai.embeddings", response.status);
      }

      // Sorted by index. Batch endpoints do not guarantee response order, and a
      // shuffled batch attaches embeddings to the wrong text without ever throwing.
      for (const item of [...body.data].sort((a, b) => a.index - b.index)) {
        out.push(item.embedding);
      }
    }

    return out;
  }

  // The batch size, not the whole call: a run that fails on its fourth batch has
  // already embedded three, and the count is what a retry storm is measured in.
  private fail(chunks: number): void {
    this.logger?.emit("embedding.request.failed", { model: this.config.model, chunks });
  }
}

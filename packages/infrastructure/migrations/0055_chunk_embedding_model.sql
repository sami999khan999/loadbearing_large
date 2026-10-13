-- Hand-added note: a chunk written before this migration has a vector and no model, so
-- every search skips it. `pnpm ai:reindex --adopt` names those vectors as the active OpenAI
-- model's without calling it; a plain `pnpm ai:reindex` re-embeds them instead.
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;--> statement-breakpoint
CREATE INDEX "document_chunks_search_idx" ON "document_chunks" USING gin ("search");
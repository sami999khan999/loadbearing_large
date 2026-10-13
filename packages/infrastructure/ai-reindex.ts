// After `EMBEDDING_PROVIDER` or `EMBEDDING_MODEL` changes. Queues one `reembed` job per
// organization on the embedding queue; the worker re-embeds that tenant's stale chunks.
// `--adopt` stamps pre-`0055` vectors instead; `--docs` indexes every published Docs page.

import { shardUrls } from "./shard-env.js";
import { BullMqQueuePublisher } from "./src/bullmq/index.js";
import { QueueName, Redis, sql } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";

const adopt = process.argv.includes("--adopt");
// The backfill for pages published before `DC.2`; a publish after it indexes itself.
const job = process.argv.includes("--docs") ? "doc-reindex" : "reembed";

// Direct, never pooled: an adopt is one long update per node, like a migration.
const nodes = shardUrls().map((shard) => new Database({ url: shard.directUrl }));
const catalog = nodes[0];
if (!catalog) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");

try {
  if (adopt) {
    // Before `0055` the only provider was OpenAI under `EMBEDDING_MODEL`, so those vectors
    // are already that model's. Any other provider would be naming vectors it never wrote.
    const provider = process.env.EMBEDDING_PROVIDER;
    const model = process.env.EMBEDDING_MODEL;
    if (provider !== "openai" || !model) {
      throw new Error(
        "--adopt needs EMBEDDING_PROVIDER=openai and the EMBEDDING_MODEL the old vectors were made with.",
      );
    }

    for (const [index, node] of nodes.entries()) {
      const result = await node.client.execute(
        sql`update document_chunks set embedding_model = ${model}
            where embedding is not null and embedding_model is null`,
      );
      console.log(`node ${index}: ${result.rowCount ?? 0} chunk(s) adopted as ${model}`);
    }
  } else {
    const queueUrl = process.env.REDIS_QUEUE_URL;
    if (!queueUrl) throw new Error("REDIS_QUEUE_URL is required.");

    const connection = new Redis(queueUrl, { maxRetriesPerRequest: null });
    // The app's own publisher, so these jobs get its attempts, backoff and retention: a bare
    // `add` ran each once, and a provider blip left that tenant's chunks stale for good.
    const queue = new BullMqQueuePublisher(connection);

    try {
      // The catalog names every organization, whichever node holds its chunks: the
      // consumer places each job on the tenant's node, not this script.
      const rows = await catalog.client.execute<{ id: string }>(sql`select id from organizations`);

      // Deduped while waiting or running, so running this twice before the worker drains it
      // queues each tenant once. Never a job id: a failed job kept it, and a rerun was a no-op.
      for (const row of rows.rows) {
        await queue.publish(
          QueueName.EMBEDDING,
          { organizationId: row.id },
          { name: job, inFlightId: `${job}_${row.id}` },
        );
      }
      console.log(`queued ${job} for ${rows.rows.length} organization(s)`);
    } finally {
      await queue.close();
      connection.disconnect();
    }
  }
} finally {
  for (const node of nodes) await node.close();
}

import type { Container } from "@loadbearing/composition";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { EmbeddingConsumer } from "../../src/consumer/embedding.consumer.js";

const ORG = "018f8c00-0000-7000-8000-000000000010";

// The two use cases the consumer can reach, recording what they were asked. `placed` runs
// the work and records the tenant, which is the placement `withShard` asks for.
const harness = () => {
  const placedFor: string[] = [];
  const reembed = vi.fn(async () => ({ chunks: 3 }));
  const indexQueued = vi.fn(async () => ({ documentId: "doc-1", chunks: 1 }));

  const container = {
    placed: (principal: { organizationId: string }, work: () => Promise<unknown>) => {
      placedFor.push(principal.organizationId);
      return work();
    },
    ai: { reembed: { execute: reembed }, indexQueued: { execute: indexQueued } },
  } as unknown as Container;

  return {
    placedFor,
    reembed,
    indexQueued,
    consumer: new EmbeddingConsumer(container, {} as never, 1),
  };
};

describe("EmbeddingConsumer", () => {
  // `pnpm ops ai-reindex` queues a job naming only the tenant; it must not reach the index path,
  // which would read a document id the job does not have.
  it("routes a reembed job to the re-embed pass, placed on the tenant's node", async () => {
    const { consumer, reembed, indexQueued, placedFor } = harness();

    await consumer.handle({ name: "reembed", data: { organizationId: ORG } } as Job);

    expect(reembed).toHaveBeenCalledTimes(1);
    expect(indexQueued).not.toHaveBeenCalled();
    expect(placedFor).toEqual([ORG]);
  });

  it("routes every other job to the index path with its data", async () => {
    const { consumer, reembed, indexQueued } = harness();
    const data = { organizationId: ORG, documentId: "doc-1", text: "hello" };

    await consumer.handle({ name: "index", data } as Job);

    expect(indexQueued).toHaveBeenCalledWith(expect.anything(), data);
    expect(reembed).not.toHaveBeenCalled();
  });
});

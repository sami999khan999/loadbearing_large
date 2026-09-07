import { QueueName } from "@loadbearing/application";
import { Queue } from "bullmq";
import { afterAll, describe, expect, inject, it } from "vitest";
import { BullMqQueuePublisher } from "../../src/bullmq/index.js";
import { RedisCacheStore, RedisConnection } from "../../src/redis/index.js";
import type {} from "./support/stack.js";

const stack = inject("stack");
const redis = new RedisConnection(stack.redis);

afterAll(async () => {
  await redis.close();
});

describe("RedisCacheStore against the running instance", () => {
  it("round-trips a value and prunes it by prefix", async () => {
    const cache = new RedisCacheStore(redis.client());

    await cache.set("smoke:probe", { ok: true }, 30);
    expect(await cache.get("smoke:probe")).toEqual({ ok: true });

    // Asserted after the prune, not before: `SCAN` returns fully-prefixed keys, and
    // passing them straight to `unlink` prefixes them again and deletes nothing.
    await cache.deletePrefix("smoke:");
    expect(await cache.get("smoke:probe")).toBeNull();
  });

  it("answers healthy for both instances, separately", async () => {
    expect(await redis.healthy("cache")).toBe(true);
    expect(await redis.healthy("queue")).toBe(true);
  });
});

describe("QueuePublisher against the running queue instance", () => {
  const queue = () => new Queue(QueueName.MAINTENANCE, { connection: redis.queueClient() });

  // The port's whole write surface, and its only exercised path anywhere: a fake would
  // prove that BullMQ's client accepts the arguments, not that a job lands on a queue.
  it("publishes a job that is on the queue under the id it was given", async () => {
    const publisher = new BullMqQueuePublisher(redis.queueClient());
    // Read back through BullMQ rather than off a Redis key: the key layout is theirs to
    // change, and a spec that pins it fails on an upgrade that broke nothing.
    const reader = queue();

    try {
      await publisher.publish(QueueName.MAINTENANCE, { probe: true }, { jobId: "smoke-probe" });
      const job = await reader.getJob("smoke-probe");

      expect(job?.data).toEqual({ probe: true });
      // From the port's defaults, and the pair that matters on a `noeviction` instance:
      // BullMQ keeps completed jobs forever otherwise.
      expect(job?.opts.attempts).toBe(3);
      expect(job?.opts.removeOnComplete).toBeTruthy();
    } finally {
      await (await reader.getJob("smoke-probe"))?.remove();
      await reader.close();
      await publisher.close();
    }
  });

  // The deduplication key is a business rule the port carries, not queue configuration:
  // "enqueue OCR for this receipt, once" has to mean once.
  it("does not enqueue a second job under an id already on the queue", async () => {
    const publisher = new BullMqQueuePublisher(redis.queueClient());
    const reader = queue();

    try {
      await publisher.publish(QueueName.MAINTENANCE, { attempt: 1 }, { jobId: "smoke-once" });
      await publisher.publish(QueueName.MAINTENANCE, { attempt: 2 }, { jobId: "smoke-once" });

      expect((await reader.getJob("smoke-once"))?.data).toEqual({ attempt: 1 });
    } finally {
      await (await reader.getJob("smoke-once"))?.remove();
      await reader.close();
      await publisher.close();
    }
  });
});

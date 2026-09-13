import { QueueName, RealtimeChannels } from "@loadbearing/application";
import { Queue } from "bullmq";
import { afterAll, describe, expect, inject, it } from "vitest";
import { BullMqQueuePublisher } from "../../src/bullmq/index.js";
import type { RealtimeMessage } from "../../src/import.js";
import {
  RedisCacheStore,
  RedisConnection,
  RedisRealtimePublisher,
  RedisRealtimeSubscriber,
} from "../../src/redis/index.js";
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

describe("realtime against the running cache instance", () => {
  const ORG = "00000000-0000-7000-8000-000000000001";
  const USER = "00000000-0000-7000-8000-000000000002";
  const CHANNEL = RealtimeChannels.user(ORG, USER);

  // The one thing no fake can answer: that the publisher's channel string and the
  // subscriber's are the same string after ioredis has finished with both.
  it("delivers a published frame to a subscriber on the other client", async () => {
    const publisher = new RedisRealtimePublisher(redis.client());
    const subscriber = new RedisRealtimeSubscriber(redis.subscriberClient(), {
      maxStreamsPerUser: 8,
      maxAgeMs: 5_000,
      queueSize: 256,
    });
    const controller = new AbortController();
    const received: RealtimeMessage[] = [];

    const reading = (async () => {
      for await (const message of subscriber.subscribe([CHANNEL], controller.signal)) {
        received.push(message);
        break;
      }
      controller.abort();
    })();

    // The SUBSCRIBE has to be on the wire before the PUBLISH: pub/sub has no replay, so
    // a frame published first is not late, it is gone.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await publisher.publish(CHANNEL, {
      kind: "event",
      id: "00000000-0000-7000-8000-00000000000a",
      name: "member.changed",
      at: new Date("2026-01-01T00:00:00Z"),
      payload: { organizationId: ORG },
    });
    await reading;

    expect(received.map((message) => message.id)).toEqual(["00000000-0000-7000-8000-00000000000a"]);
  });

  // PING is one of the eight commands valid in subscriber mode, which is what lets the
  // health check report on the connection the streams are actually on.
  it("answers healthy on a connection that has entered subscriber mode", async () => {
    const subscriber = new RedisRealtimeSubscriber(redis.subscriberClient(), {
      maxStreamsPerUser: 8,
      maxAgeMs: 50,
      queueSize: 8,
    });
    const controller = new AbortController();

    for await (const _ of subscriber.subscribe([CHANNEL], controller.signal)) break;

    expect(redis.opened("subscriber")).toBe(true);
    expect(await redis.healthy("subscriber")).toBe(true);
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

  // Both defaulted, and both only observable on a real queue: the job name is what a
  // consumer switches on, and priority is how mail nobody can sign up without goes first.
  it("carries the job name and priority the caller asked for", async () => {
    const publisher = new BullMqQueuePublisher(redis.queueClient());
    const reader = queue();

    try {
      await publisher.publish(
        QueueName.MAINTENANCE,
        { probe: true },
        { jobId: "smoke-named", name: "partitions", priority: 1 },
      );
      const job = await reader.getJob("smoke-named");

      expect(job?.name).toBe("partitions");
      expect(job?.opts.priority).toBe(1);
    } finally {
      await (await reader.getJob("smoke-named"))?.remove();
      await reader.close();
      await publisher.close();
    }
  });

  // The default the four call sites above rely on: a queue carrying one kind of work
  // names no job, and BullMQ still needs a name.
  it("names the job after the queue when the caller passes none", async () => {
    const publisher = new BullMqQueuePublisher(redis.queueClient());
    const reader = queue();

    try {
      await publisher.publish(QueueName.MAINTENANCE, { probe: true }, { jobId: "smoke-unnamed" });

      expect((await reader.getJob("smoke-unnamed"))?.name).toBe(QueueName.MAINTENANCE);
    } finally {
      await (await reader.getJob("smoke-unnamed"))?.remove();
      await reader.close();
      await publisher.close();
    }
  });
});

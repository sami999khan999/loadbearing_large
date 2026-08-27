import "dotenv/config";
import { BullMqQueuePublisher, QueueName } from "../bullmq/index.js";
import { RedisCacheStore, RedisConnection } from "../redis/index.js";
import { S3StorageGateway, StorageKey } from "../s3/index.js";

// A wiring check against the running containers, not a unit test. These classes are
// adapters, and testing an adapter against a fake tests the fake.
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const redis = new RedisConnection({
  cacheUrl: required("REDIS_CACHE_URL"),
  queueUrl: required("REDIS_QUEUE_URL"),
});

const cache = new RedisCacheStore(redis.client());
await cache.set("smoke:probe", { ok: true }, 30);
console.log("cache:", await cache.get("smoke:probe"));
await cache.deletePrefix("smoke:");
console.log("cache after prune:", await cache.get("smoke:probe"));

const storage = new S3StorageGateway({
  endpoint: required("S3_ENDPOINT"),
  region: required("S3_REGION"),
  bucket: required("S3_BUCKET"),
  accessKey: required("S3_ACCESS_KEY"),
  secretKey: required("S3_SECRET_KEY"),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
});

const key = StorageKey.build("smoke", "probe.txt", new Date());
const stored = await storage.put(key, new TextEncoder().encode("hello"), "text/plain");
console.log("storage:", new TextDecoder().decode(await storage.get(key)));
console.log("checksum:", stored.checksum);
console.log("exists:", await storage.exists(key));
console.log("presigned:", (await storage.presignDownload(key, 60)).slice(0, 80), "…");
await storage.delete(key);
console.log("exists after delete:", await storage.exists(key));

const publisher = new BullMqQueuePublisher(redis.queueClient());
await publisher.publish(QueueName.MAINTENANCE, { probe: true }, { jobId: "smoke-probe" });
console.log("queue: published to", QueueName.MAINTENANCE);

await publisher.close();
await redis.close();

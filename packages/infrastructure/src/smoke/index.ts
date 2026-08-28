// The repository root, not this package. `dotenv/config` reads `.env` relative to
// the process cwd, which is `packages/infrastructure` under a pnpm filter — so the
// bare import found nothing and every variable came back undefined. The two other
// runners avoid this with `--env-file-if-exists=../../.env`; this one says it here,
// because `pnpm smoke` is also run from the package directory by hand.
import { config } from "dotenv";

config({ path: new URL("../../../../.env", import.meta.url) });

import { BullMqQueuePublisher, QueueName } from "../bullmq/index.js";
import { ClickHouseConnection } from "../clickhouse/index.js";
import { LokiLogReader } from "../loki/index.js";
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

// Optional, in the same way the adapters are: these two stores are opt-in, and a
// smoke run against a stack that does not include them should say so and pass rather
// than fail on a service nobody started.
const optional = (name: string): string | undefined => process.env[name] || undefined;

// The whole projection round trip, against the real table the init script created.
// A UUID that no `activity_log` row will ever carry, inserted twice on purpose: the
// second insert is what proves `ReplacingMergeTree` is doing the job the consumer's
// idempotency depends on. `FINAL` is why the count is visible before a merge.
const clickhouseUrl = optional("CLICKHOUSE_URL");
if (clickhouseUrl) {
  // The local scratch stack's credentials, which are `ratchet` everywhere on purpose
  // — this script only ever runs against `infra/docker-compose.yml`.
  const database = process.env.CLICKHOUSE_DATABASE ?? "ratchet";
  const clickhouse = new ClickHouseConnection({
    url: clickhouseUrl,
    database,
    username: process.env.CLICKHOUSE_USER ?? "ratchet",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
  });

  console.log("clickhouse healthy:", await clickhouse.healthy());

  const probeId = "00000000-0000-7000-8000-0000000000ff";
  const row = {
    id: probeId,
    organization_id: "00000000-0000-7000-8000-0000000000fe",
    occurred_at: "2026-01-01 00:00:00.000",
    actor_id: "00000000-0000-7000-8000-0000000000fd",
    action: "smoke.probe",
    subject_id: null,
    payload: JSON.stringify({ probe: true }),
  };

  await clickhouse.insert("activity_events", [row, row]);
  const counted = await clickhouse.query<{ readonly n: number }>(
    `SELECT toUInt32(count()) AS n FROM ${database}.activity_events FINAL WHERE id = {id:UUID}`,
    { id: probeId },
  );
  console.log("clickhouse dedup (expect 1):", counted[0]?.n);

  await clickhouse.command(`DELETE FROM ${database}.activity_events WHERE id = {id:UUID}`, {
    id: probeId,
  });
  await clickhouse.close();
} else {
  console.log("clickhouse: skipped, CLICKHOUSE_URL unset");
}

// Reads back whatever Alloy has already shipped. Asserting on a specific line would
// make this depend on something having been logged in the last hour, which is a flaky
// test rather than a wiring check — that the query returns and parses is the claim.
const lokiUrl = optional("LOKI_URL");
if (lokiUrl) {
  const logs = new LokiLogReader({ url: lokiUrl, tenantId: optional("LOKI_TENANT_ID") });
  console.log("loki healthy:", await logs.healthy());

  const entries = await logs.query({
    from: new Date(Date.now() - 60 * 60 * 1_000),
    to: new Date(),
    limit: 5,
  });
  console.log("loki entries in the last hour:", entries.length);
  for (const entry of entries) {
    console.log(
      `  ${entry.timestamp.toISOString()} ${entry.app} ${entry.level} ${entry.eventCode}`,
    );
  }
} else {
  console.log("loki: skipped, LOKI_URL unset");
}

const publisher = new BullMqQueuePublisher(redis.queueClient());
await publisher.publish(QueueName.MAINTENANCE, { probe: true }, { jobId: "smoke-probe" });
console.log("queue: published to", QueueName.MAINTENANCE);

await publisher.close();
await redis.close();

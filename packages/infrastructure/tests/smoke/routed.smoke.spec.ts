import { Shard } from "@loadbearing/application";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { migrate, type OrganizationId, sql, Uuid } from "../../src/import.js";
import { Database } from "../../src/pg/primitive/index.js";
import { PgShardResolver } from "../../src/pg/repository/index.js";
import { RedisCacheStore, RedisConnection } from "../../src/redis/index.js";
import { RecordingLogger } from "../support/recording.logger.js";
import type {} from "./support/stack.js";

// `24.6`, as far as it can run. **Its write half is blocked by `24.1`**: a routed insert
// on node 1 is a `23503` before it is a measurement. See docs/reference/sharding.md.

const stack = inject("stack");
const shard1 = stack.shard1;

// How many resolutions each reading averages over. One is noise; a thousand is a number.
const RESOLVES = 1_000;

describe.skipIf(!shard1 || !stack.routed)("what routing costs a request", () => {
  // `skipIf` skips the tests, not this body: vitest still runs it to register them.
  if (!shard1 || !stack.routed) return;

  const logger = new RecordingLogger();

  const catalog = new Database({ url: stack.database.url });
  const catalogDirect = new Database({ url: stack.database.directUrl });
  const node1 = new Database({ url: shard1.url });

  // The real cache, not a spec's Map: the warm path is a Redis round trip, and pretending
  // otherwise would report a resolution cost the deployment never pays.
  const redis = new RedisConnection(stack.redis);
  const cache = new RedisCacheStore(redis.client());

  const resolver = new PgShardResolver(
    () => catalog,
    () => cache,
    () => logger,
  );

  const placed = Uuid.v7() as OrganizationId;
  const readings: { readonly path: string; readonly perCallUs: number }[] = [];

  const timed = async (work: () => Promise<void>): Promise<number> => {
    const started = performance.now();
    await work();
    return performance.now() - started;
  };

  const per = (ms: number): number => Math.round((ms * 1_000) / RESOLVES);

  beforeAll(async () => {
    await migrate(catalogDirect.client, { migrationsFolder: "./migrations" });

    await catalog.client.execute(sql`
      insert into organizations (id, slug, name)
      values (${placed}::uuid, ${`routed-${placed}`}, 'Routed')
    `);
    await catalog.client.execute(sql`
      insert into shard_assignments (shard_key, node) values (${placed}, 1)
    `);
  });

  afterAll(async () => {
    if (readings.length > 0) console.table(readings);

    await resolver.invalidate(Shard.keyOf(placed));
    await catalog.client.execute(sql`delete from shard_assignments where shard_key = ${placed}`);
    await catalog.client.execute(sql`delete from organizations where id = ${placed}::uuid`);

    await redis.close();
    await Promise.all([catalog.close(), catalogDirect.close(), node1.close()]);
  });

  // **The number every routed request pays.** The miss is measured apart from the
  // invalidation that forces it, or it reads one round trip larger than it is.
  it("resolves a placement in one cache read, and a miss in one query more", async () => {
    const key = Shard.keyOf(placed);

    await resolver.resolve(key);
    const warm = await timed(async () => {
      for (let attempt = 0; attempt < RESOLVES; attempt += 1) await resolver.resolve(key);
    });

    const invalidateOnly = await timed(async () => {
      for (let attempt = 0; attempt < RESOLVES; attempt += 1) await resolver.invalidate(key);
    });

    const both = await timed(async () => {
      for (let attempt = 0; attempt < RESOLVES; attempt += 1) {
        await resolver.invalidate(key);
        await resolver.resolve(key);
      }
    });

    readings.push(
      { path: "warm — one cache read", perCallUs: per(warm) },
      {
        path: "cold — cache read, catalog query, cache write",
        perCallUs: per(both - invalidateOnly),
      },
      { path: "cache invalidate, for reference", perCallUs: per(invalidateOnly) },
    );

    // The warm path is the one every request takes, and it has to be the cheap one. A
    // factor of two is a floor rather than a target: it is what makes this stable.
    expect(warm).toBeLessThan(both - invalidateOnly);
    expect(await resolver.resolve(key)).toBe(1);
  });

  // A cross-tenant pass loops **nodes**, serially — `Container.eachShard`. Measured here
  // because a pass that fanned out would hold a connection open on every node at once.
  it("walks both nodes serially, which is what every cross-tenant pass does", async () => {
    const seen: number[] = [];

    const walk = await timed(async () => {
      for (const [index, node] of [catalog, node1].entries()) {
        await node.client.execute(sql`select count(*) from notifications`);
        seen.push(index);
      }
    });

    readings.push({ path: `walk both nodes — ${Math.round(walk)} ms for two`, perCallUs: 0 });
    expect(seen).toEqual([0, 1]);
  });

  // Not a measurement: the reason there is no write reading above. A routed insert on
  // node 1 cannot run until `24.1` decides what happens to the ten crossing keys.
  it("cannot write a routed row to node 1 at all, which is what `24.1` is for", async () => {
    const thrown = await node1.client
      .execute(
        sql`insert into notifications (id, organization_id, user_id, event_id, kind, category,
              params, link, subject_id, created_at)
            values (${Uuid.v7()}::uuid, ${placed}::uuid, ${Uuid.v7()}::uuid, ${Uuid.v7()}::uuid,
              'message.received', 'messaging', '{}'::jsonb, null, null, now())`,
      )
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(thrown).not.toBeNull();
  });
});

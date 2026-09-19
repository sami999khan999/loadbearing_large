import { Shard, TablePlacement } from "@loadbearing/application";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  CacheStore,
  type ConversationId,
  type MessageId,
  migrate,
  type OrganizationId,
  sql,
  type UserId,
  Uuid,
} from "../../src/import.js";
import { Database, DatabaseCluster } from "../../src/pg/primitive/index.js";
import {
  PgConversationRepository,
  PgMessageRepository,
  PgShardResolver,
} from "../../src/pg/repository/index.js";
import { TenantPartitionSeed } from "../../src/pg/seed/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { RecordingLogger } from "../support/recording.logger.js";
import type {} from "./support/stack.js";

const stack = inject("stack");
const shard1 = stack.shard1;

// Postgres' own class for a foreign key that has nothing to point at. Asserted by code
// rather than by message, which is localised and reworded between server versions.
const FOREIGN_KEY_VIOLATION = "23503";

interface PgFailure {
  readonly code?: string;
  readonly constraint?: string;
}

// Drizzle wraps the driver error and puts the query in `message`, so the constraint is
// one `cause` down. Walked rather than read at a fixed depth: the wrapping is not ours.
const pgFailure = (error: unknown): PgFailure => {
  for (let at: unknown = error; at instanceof Error; at = at.cause) {
    const failure = at as Error & PgFailure;
    if (failure.code) return { code: failure.code, constraint: failure.constraint };
  }

  return {};
};

// A spec's own double, which is what keeps this rehearsal about the routing seam:
// `RedisCacheStore` would put a second service between it and the thing it rehearses.
class MapCache extends CacheStore {
  private readonly held = new Map<string, unknown>();

  public override async get<T>(key: string): Promise<T | null> {
    return (this.held.get(key) as T) ?? null;
  }

  public override async set<T>(key: string, value: T): Promise<void> {
    this.held.set(key, value);
  }

  public override async setIfAbsent<T>(key: string, value: T): Promise<boolean> {
    if (this.held.has(key)) return false;
    this.held.set(key, value);
    return true;
  }

  public override async delete(key: string): Promise<void> {
    this.held.delete(key);
  }

  public override async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.held.keys()]) if (key.startsWith(prefix)) this.held.delete(key);
  }
}

describe.skipIf(!shard1)("a two-node cluster", () => {
  const logger = new RecordingLogger();
  const shards = new ShardScope();
  const scope = new TransactionScope();
  const cache = new MapCache();

  // Opened here rather than through the cluster, because the assertions read both nodes
  // directly: the point is where a row physically landed, not where a port says it is.
  const catalog = new Database({ url: stack.database.url });
  const catalogDirect = new Database({ url: stack.database.directUrl });
  const node1 = new Database({ url: shard1?.url ?? stack.database.url });
  const node1Direct = new Database({ url: shard1?.directUrl ?? stack.database.directUrl });

  const resolver = new PgShardResolver(
    () => catalog,
    () => cache,
    () => logger,
  );

  const cluster = DatabaseCluster.of(
    [
      { pooled: catalog, direct: catalogDirect },
      { pooled: node1, direct: node1Direct },
    ],
    resolver,
  );

  // Two tenants, one per node. Created here rather than taken from the seed: the seed
  // places the bootstrap organization on node 0, and this needs one that is not there.
  const onNodeZero = Uuid.v7() as OrganizationId;
  const onNodeOne = Uuid.v7() as OrganizationId;
  const author = Uuid.v7() as UserId;

  const conversations = new PgConversationRepository(cluster, scope, shards);
  const messages = new PgMessageRepository(cluster, scope, shards);

  const place = async (organizationId: OrganizationId, node: number) => {
    await catalog.client.execute(sql`
      insert into organizations (id, slug, name)
      values (${organizationId}::uuid, ${`rehearsal-${organizationId}`}, 'Rehearsal')
    `);
    await catalog.client.execute(sql`
      insert into shard_assignments (shard_key, node)
      values (${organizationId}, ${node})
    `);
  };

  beforeAll(async () => {
    // Both nodes, the same migrations folder: a shard is not a different schema, and a
    // rehearsal that migrated one would fail on a missing table rather than on the seam.
    for (const node of [catalogDirect, node1Direct]) {
      await migrate(node.client, { migrationsFolder: "./migrations" });
    }

    await catalog.client.execute(sql`
      insert into users (id, name, email, email_verified)
      values (${author}::uuid, 'Rehearsal', ${`${author}@example.test`}, true)
    `);

    await place(onNodeZero, 0);
    await place(onNodeOne, 1);

    // A partition is physical, so each tenant's are created on its own node.
    await new TenantPartitionSeed(DatabaseCluster.single(catalogDirect), scope, shards).run(
      onNodeZero,
    );
    await new TenantPartitionSeed(DatabaseCluster.single(node1Direct), scope, shards).run(
      onNodeOne,
    );
  });

  afterAll(async () => {
    for (const organizationId of [onNodeZero, onNodeOne]) {
      await catalog.client.execute(
        sql`delete from shard_assignments where shard_key = ${organizationId}`,
      );
      await catalog.client.execute(
        sql`delete from organizations where id = ${organizationId}::uuid`,
      );
    }
    await catalog.client.execute(sql`delete from users where id = ${author}::uuid`);

    await Promise.all([catalog.close(), catalogDirect.close(), node1.close(), node1Direct.close()]);
  });

  const placedOn = async <T>(organizationId: OrganizationId, work: () => Promise<T>) => {
    const key = Shard.keyOf(organizationId);
    return shards.within({ key, node: await resolver.resolve(key) }, work);
  };

  const messageRowsOn = async (database: Database, messageId: MessageId) => {
    const found = await database.client.execute<{ count: string }>(
      sql`select count(*)::text as count from messages where id = ${messageId}::uuid`,
    );
    return Number(found.rows[0]?.count ?? 0);
  };

  it("resolves each tenant to the node its directory row names", async () => {
    expect(await resolver.resolve(Shard.keyOf(onNodeZero))).toBe(0);
    expect(await resolver.resolve(Shard.keyOf(onNodeOne))).toBe(1);
  });

  it("keeps the directory on the catalog, and only there", async () => {
    const onCatalog = await catalog.client.execute<{ count: string }>(sql`
      select count(*)::text as count from shard_assignments
      where shard_key in (${onNodeZero}, ${onNodeOne})
    `);
    const onShard = await node1.client.execute<{ count: string }>(sql`
      select count(*)::text as count from shard_assignments
      where shard_key in (${onNodeZero}, ${onNodeOne})
    `);

    expect(Number(onCatalog.rows[0]?.count)).toBe(2);
    expect(Number(onShard.rows[0]?.count)).toBe(0);
  });

  it("writes a routed row to the node the tenant is placed on, and to no other", async () => {
    const messageId = Uuid.v7() as MessageId;

    await placedOn(onNodeZero, async () => {
      const conversationId = await conversations.save({
        organizationId: onNodeZero,
        kind: "channel",
        title: "rehearsal",
        directKey: null,
        createdBy: author,
        memberIds: [author],
      });

      await messages.save({
        id: messageId,
        createdAt: new Date(),
        organizationId: onNodeZero,
        conversationId: conversationId as ConversationId,
        authorId: author,
        clientId: Uuid.v7(),
        body: "node zero",
      });
    });

    expect(await messageRowsOn(catalog, messageId)).toBe(1);
    expect(await messageRowsOn(node1, messageId)).toBe(0);
  });

  // **The split's first real cost, asserted rather than discovered.** Nine routed tables
  // carry a foreign key to a catalog one, and `24.1` decides what happens to all nine.
  it("fails on a foreign key naming a catalog table when the tenant is on node 1", async () => {
    const thrown = await placedOn(onNodeOne, () =>
      conversations
        .save({
          organizationId: onNodeOne,
          kind: "channel",
          title: "rehearsal",
          directKey: null,
          createdBy: author,
          memberIds: [author],
        })
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );

    const failure = pgFailure(thrown);
    expect(failure.code).toBe(FOREIGN_KEY_VIOLATION);

    // Which constraint trips first depends on insert order, so this names the class and
    // not a constraint: a foreign key on shard 1 pointing at a table only the catalog has.
    const referenced = TablePlacement.CATALOG.find((table) =>
      (failure.constraint ?? "").includes(`_${table}_`),
    );

    expect(referenced, `${failure.constraint} names no catalog table`).toBeDefined();
  });
});

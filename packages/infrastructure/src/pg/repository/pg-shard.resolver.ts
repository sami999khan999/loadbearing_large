import {
  type CacheStore,
  InternalError,
  type Logger,
  type ShardKey,
  ShardResolver,
  sql,
} from "../../import.js";
import type { Database } from "../primitive/index.js";

// A placement changes once a year, not once a minute — `CapabilityCache`'s shape with a
// deliberately longer TTL, and the move job invalidates explicitly rather than waiting.
const TTL_SECONDS = 300;

const keyOf = (key: ShardKey): string => `shard:key:${key}`;

// **Not a `BaseRepository`.** This is what `DatabaseCluster.forKey` calls, and a
// resolver that routed would ask itself where it lives.
export class PgShardResolver extends ShardResolver {
  // Thunks, because the cluster is built *with* this resolver: the catalog pool and
  // the cache do not exist yet when the container constructs one. Called after.
  public constructor(
    private readonly catalog: () => Database,
    private readonly cache: () => CacheStore,
    private readonly logger: () => Logger,
  ) {
    super();
  }

  public override async resolve(key: ShardKey): Promise<number> {
    const cached = await this.cache().get<number>(keyOf(key));
    if (cached !== null) return cached;

    const rows = await this.catalog().client.execute<{ node: number }>(
      sql`select node from shard_assignments where shard_key = ${key}`,
    );

    const node = rows.rows[0]?.node;
    // A missing row is a tenant the founder never placed. Today every node is zero and
    // guessing would work; after a split it would put a tenant's rows somewhere else.
    if (node === undefined) {
      this.logger().emit("shard.resolution.failed", { key });
      throw new InternalError(new Error(`No shard assignment for ${key}.`));
    }

    await this.cache().set(keyOf(key), node, TTL_SECONDS);
    return node;
  }

  public override async invalidate(key: ShardKey): Promise<void> {
    await this.cache().delete(keyOf(key));
  }
}

import { InternalError, type ShardKey, type ShardResolver } from "../../import.js";
import { Database, type DatabaseConfig } from "./database.js";

// One physical Postgres, pooled twice: through the pooler for everything, and directly
// for the DDL a transaction pooler cannot carry. See docs/infra/reference/pgbouncer.md.
export interface ShardConfig {
  readonly pooled: DatabaseConfig;
  readonly direct: DatabaseConfig;
}

// Node 0 for every key, which is what one node means.
const NODE_ZERO = {
  resolve: () => Promise.resolve(0),
  placementOf: () => Promise.resolve({ node: 0, frozen: false }),
  invalidate: () => Promise.resolve(),
} as ShardResolver;

// Every physical node, indexed. Node 0 is the catalog and it always exists; a
// deployment that has never sharded has exactly one entry and behaves as it always did.
export class DatabaseCluster {
  private constructor(
    private readonly nodes: readonly Database[],
    private readonly directNodes: readonly Database[],
    private readonly resolver: ShardResolver,
  ) {}

  // **The only place in `src/` that writes `new Database(`** — §23 asserts it. A second
  // one is a pool nothing closes and nothing counts.
  public static from(shards: readonly ShardConfig[], resolver: ShardResolver): DatabaseCluster {
    return DatabaseCluster.of(
      shards.map((shard) => ({
        pooled: new Database(shard.pooled),
        direct: new Database(shard.direct),
      })),
      resolver,
    );
  }

  // Already-open pools, shared rather than reopened, which keeps `close()` honest. The
  // one factory that reaches the constructor: what a node carries is declared once.
  public static of(
    nodes: readonly { readonly pooled: Database; readonly direct: Database }[],
    resolver: ShardResolver,
  ): DatabaseCluster {
    if (nodes.length === 0) throw new InternalError(new Error("A cluster needs one shard."));

    return new DatabaseCluster(
      nodes.map((node) => node.pooled),
      nodes.map((node) => node.direct),
      resolver,
    );
  }

  // `of` with the resolver that answers node 0 for every key, which is what an
  // unsharded deployment is. One `direct` argument means DDL shares the pooled handle.
  public static single(database: Database, direct?: Database): DatabaseCluster {
    return DatabaseCluster.of([{ pooled: database, direct: direct ?? database }], NODE_ZERO);
  }

  // Node 0, always. The catalog is the last single primary and §4 files what to do
  // about that; until then, "which node is the catalog" is not a question.
  public catalog(): Database {
    return this.at(0);
  }

  public directCatalog(): Database {
    return this.directAt(0);
  }

  public async forKey(key: ShardKey): Promise<Database> {
    return this.at(await this.resolver.resolve(key));
  }

  public async directForKey(key: ShardKey): Promise<Database> {
    return this.directAt(await this.resolver.resolve(key));
  }

  // Every node, for the cross-tenant loops: the migrator, the seed, the partition pass,
  // the outbox drain. One node today, which is what makes the loop cheap to write now.
  public each(): readonly Database[] {
    return this.nodes;
  }

  public eachDirect(): readonly Database[] {
    return this.directNodes;
  }

  public get size(): number {
    return this.nodes.length;
  }

  // Per shard rather than one boolean: "the database is down" is a different page from
  // "shard 2 is down", and a single flag cannot tell them apart.
  public async isHealthy(): Promise<Readonly<Record<number, boolean>>> {
    const results = await Promise.all(this.nodes.map((node) => node.isHealthy()));
    return Object.fromEntries(results.map((healthy, index) => [index, healthy]));
  }

  public async close(): Promise<void> {
    const pools = new Set([...this.nodes, ...this.directNodes]);
    await Promise.all([...pools].map((node) => node.close()));
  }

  // An out-of-range node is an error rather than a fall back to zero: the directory
  // naming a node nobody deployed is a misconfiguration, and the wrong shard is worse.
  public at(node: number): Database {
    const database = this.nodes[node];
    if (!database) throw DatabaseCluster.unknown(node);
    return database;
  }

  public directAt(node: number): Database {
    const database = this.directNodes[node];
    if (!database) throw DatabaseCluster.unknown(node);
    return database;
  }

  private static unknown(node: number): InternalError {
    return new InternalError(new Error(`No shard is deployed at node ${node}.`));
  }
}

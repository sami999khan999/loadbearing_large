import { drizzle, type Logger, type NodePgDatabase, Pool } from "../../import.js";
import * as schema from "../schema/index.js";

export interface DatabaseConfig {
  readonly url: string;
  readonly maxConnections?: number;
  readonly statementTimeoutMs?: number;
  // Every statement, as drizzle issues it. This is the seam the query-count
  // assertions need — "three queries" is a claim that decays silently without one.
  readonly logger?: Logger;
}

// The handle every repository queries through, pool or open transaction alike.
// Named so BaseRepository and TransactionScope agree on one type.
export type DrizzleClient = NodePgDatabase<typeof schema>;

export class Database {
  private readonly pool: Pool;
  public readonly client: DrizzleClient;

  public constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      connectionString: config.url,
      max: config.maxConnections ?? 10,
      // Not optional. Without it one accidental cross join holds a connection
      // until somebody notices, and a pool of ten is the whole application.
      statement_timeout: config.statementTimeoutMs ?? 30_000,
      idleTimeoutMillis: 30_000,
    });
    this.client = drizzle(this.pool, { schema, logger: config.logger });
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

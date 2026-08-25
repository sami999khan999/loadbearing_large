import { Redis, type RedisOptions } from "../import.js";

export interface RedisConfig {
  // Evicts under pressure. Everything on it rebuilds from Postgres.
  readonly cacheUrl: string;
  // Never evicts. A queued job is derived from nothing.
  readonly queueUrl: string;
  readonly keyPrefix?: string;
}

// Two instances, one class. Which connection a consumer gets is a property of what
// it is doing, not a wiring decision two same-typed arguments could get backwards.
export class RedisConnection {
  private readonly clients = new Set<Redis>();

  public constructor(private readonly config: RedisConfig) {}

  // Cache and session reads. Prefixed, and safe to share.
  public client(): Redis {
    return this.create(this.config.cacheUrl, {
      keyPrefix: this.config.keyPrefix ?? "ratchet:",
    });
  }

  // `maxRetriesPerRequest: null` is not optional — BullMQ's blocking commands sit
  // open indefinitely and ioredis's default retry limit kills them silently.
  public queueClient(): Redis {
    return this.create(this.config.queueUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  private create(url: string, options: RedisOptions): Redis {
    const redis = new Redis(url, {
      lazyConnect: false,
      // Batches commands issued in the same tick into one round trip.
      enableAutoPipelining: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
      ...options,
    });
    this.clients.add(redis);
    return redis;
  }

  public async close(): Promise<void> {
    await Promise.all([...this.clients].map((client) => client.quit()));
    this.clients.clear();
  }
}

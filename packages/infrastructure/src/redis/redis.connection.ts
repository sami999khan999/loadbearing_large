import { Redis, type RedisOptions } from "../import.js";

export interface RedisConfig {
  // Evicts under pressure. Everything on it rebuilds from Postgres.
  readonly cacheUrl: string;
  // Never evicts. A queued job is derived from nothing.
  readonly queueUrl: string;
  // Namespaces this application's keys on a Redis someone else may also be using.
  // Deliberately not the project name: a literal here survives a rename and comes back
  // as a cache that reads nothing, so the default stays generic and the real value is
  // a deployment decision. See 27.5.
  readonly keyPrefix?: string;
}

// Which instance a consumer is asking about. The health check takes it rather than
// exposing the clients, so `Container` never names `Redis` (17).
export type RedisRole = "cache" | "queue";

// Two instances, one class. Which connection a consumer gets is a property of what
// it is doing, not a wiring decision two same-typed arguments could get backwards.
export class RedisConnection {
  private readonly clients = new Map<RedisRole, Redis>();

  public constructor(private readonly config: RedisConfig) {}

  // Cache and session reads. Prefixed, and safe to share.
  public client(): Redis {
    return this.resolve("cache");
  }

  // `maxRetriesPerRequest: null` is not optional — BullMQ's blocking commands sit
  // open indefinitely and ioredis's default retry limit kills them silently.
  public queueClient(): Redis {
    return this.resolve("queue");
  }

  // PING on the instance callers actually hold. Opening a second connection to answer
  // this would report on a socket nothing else uses — green while the cache is down.
  public async healthy(role: RedisRole): Promise<boolean> {
    try {
      return (await this.resolve(role).ping()) === "PONG";
    } catch {
      return false;
    }
  }

  // One client per role, memoised. `client()` called twice is two TCP connections
  // otherwise, and the second one is invisible until the pool count is the symptom.
  private resolve(role: RedisRole): Redis {
    const existing = this.clients.get(role);
    if (existing) return existing;

    const created =
      role === "cache"
        ? this.create(this.config.cacheUrl, { keyPrefix: this.config.keyPrefix ?? "app:" })
        : this.create(this.config.queueUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          });

    this.clients.set(role, created);
    return created;
  }

  private create(url: string, options: RedisOptions): Redis {
    return new Redis(url, {
      lazyConnect: false,
      // Batches commands issued in the same tick into one round trip.
      enableAutoPipelining: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
      ...options,
    });
  }

  public async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.quit()));
    this.clients.clear();
  }
}

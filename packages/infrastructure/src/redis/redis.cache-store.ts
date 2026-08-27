import { CacheStore, type Redis } from "../import.js";

export class RedisCacheStore extends CacheStore {
  public constructor(private readonly redis: Redis) {
    super();
  }

  public override async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupt entry is a miss, never an error. Throwing turns a stale cache
      // after a DTO change into an outage; evicting turns it into a latency bump.
      await this.redis.del(key);
      return null;
    }
  }

  public override async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  public override async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  public override async deletePrefix(prefix: string): Promise<void> {
    // ioredis applies `keyPrefix` to key arguments but not to SCAN, in either
    // direction: the MATCH pattern needs it added, and the keys SCAN returns come
    // back fully prefixed. Handing those straight to `unlink` prefixes them twice
    // and deletes nothing, silently — UNLINK on a missing key is not an error.
    const keyPrefix = this.redis.options.keyPrefix ?? "";
    const pattern = `${keyPrefix}${prefix}*`;
    let cursor = "0";

    // SCAN with UNLINK, never KEYS with DEL: KEYS is O(n) over the whole keyspace
    // and blocks the server, and UNLINK frees memory off the main thread.
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) {
        await this.redis.unlink(...keys.map((key) => key.slice(keyPrefix.length)));
      }
    } while (cursor !== "0");
  }
}

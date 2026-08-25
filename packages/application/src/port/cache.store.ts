export abstract class CacheStore {
  public abstract get<T>(key: string): Promise<T | null>;
  public abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  public abstract delete(key: string): Promise<void>;

  // Invalidate a whole subject. Here rather than at the call site, because enumerating
  // keys to do it by hand pushes Redis semantics into the domain.
  public abstract deletePrefix(prefix: string): Promise<void>;
}

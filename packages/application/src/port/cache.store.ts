export abstract class CacheStore {
  public abstract get<T>(key: string): Promise<T | null>;
  public abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  public abstract delete(key: string): Promise<void>;

  // Here rather than at the call site: enumerating keys by hand pushes Redis semantics
  // into the domain.
  public abstract deletePrefix(prefix: string): Promise<void>;
}

import type { CacheStore, CapabilityRepository, CapabilitySet } from "@loadbearing/application";
import type { OrganizationId, UserId } from "@loadbearing/contracts";
import type { ApiKeyRecord, ApiKeyRepository } from "../../src/apikey/api-key.resolver.js";
import type { RequestHeaders, ResolvedSession, SessionResolver } from "../../src/import.js";

// Hand-written doubles rather than `@loadbearing/composition`'s fakes, and that is not
// duplication: `composition` depends on this package, so importing its fakes here would
// close a cycle. These are also narrower — each records what it was asked, because the
// behaviours worth pinning here are about *which* call happened and in what order.

export class RecordingCapabilityRepository implements CapabilityRepository {
  public readonly calls: { organizationId: string; userId: string }[] = [];

  public constructor(private readonly sets: ReadonlyMap<string, CapabilitySet>) {}

  public resolveFor(organizationId: OrganizationId, userId: UserId): Promise<CapabilitySet> {
    this.calls.push({ organizationId, userId });
    const set = this.sets.get(`${organizationId}:${userId}`);
    if (!set) throw new Error(`No capability set staged for ${organizationId}:${userId}`);
    return Promise.resolve(set);
  }
}

// A real map, so a spec can assert on the key rather than on a mock's call log. The key
// layout *is* the behaviour under test in `CapabilityCache`.
export class MapCacheStore implements CacheStore {
  public readonly entries = new Map<string, unknown>();

  public get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.entries.get(key) as T | undefined) ?? null);
  }

  public set<T>(key: string, value: T): Promise<void> {
    this.entries.set(key, value);
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  public deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
    return Promise.resolve();
  }
}

// Returns every staged record regardless of prefix, which is deliberate: the real
// repository narrows by an indexed column, and the resolver must still not trust the
// narrowing — the hash comparison is what decides.
export class StubApiKeyRepository implements ApiKeyRepository {
  public readonly prefixes: string[] = [];
  public readonly touched: { id: string; at: Date }[] = [];

  public constructor(private readonly records: readonly ApiKeyRecord[]) {}

  public findByPrefix(prefix: string): Promise<readonly ApiKeyRecord[]> {
    this.prefixes.push(prefix);
    return Promise.resolve(this.records);
  }

  public touch(id: string, at: Date): Promise<void> {
    this.touched.push({ id, at });
    return Promise.resolve();
  }
}

export class StubSessionResolver implements SessionResolver {
  public calls = 0;

  public constructor(private readonly session: ResolvedSession | null) {}

  public resolve(_headers: RequestHeaders): Promise<ResolvedSession | null> {
    this.calls += 1;
    return Promise.resolve(this.session);
  }
}

// The narrowest thing `RequestHeaders` accepts. A real `Headers` would work too; a plain
// lookup keeps these specs free of a DOM lib this package does not otherwise need.
export function headers(values: Readonly<Record<string, string>> = {}): RequestHeaders {
  return { get: (name) => values[name.toLowerCase()] ?? null };
}

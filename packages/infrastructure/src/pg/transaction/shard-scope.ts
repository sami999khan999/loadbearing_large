import type { ShardKey } from "../../import.js";
import { AsyncLocalStorage } from "../../import.js";

// A key and the node it resolved to. **Both**, because the node is what a pool lookup
// needs and the key is what a log line and a nested resolve need.
export interface PlacedShard {
  readonly key: ShardKey;
  readonly node: number;
}

// Which shard the ambient work belongs to. Established once per request in the web
// middleware and once per job in a consumer — never per query.
export class ShardScope {
  private readonly storage = new AsyncLocalStorage<PlacedShard>();

  // Undefined outside any placed work, which is the honest answer for a catalog read
  // on the sign-in path: no key is known yet, and none is needed.
  public current(): PlacedShard | undefined {
    return this.storage.getStore();
  }

  // The node is resolved by the caller, before this runs. That is the whole reason
  // `BaseRepository.db` can stay synchronous: the one await happens once, out here.
  public async within<T>(placed: PlacedShard, work: () => Promise<T>): Promise<T> {
    return this.storage.run(placed, work);
  }

  // For a caller that owns the rest of its context and has no callback to wrap — a
  // spec's hooks, and nothing in `src/`, where `within` is always the shape.
  public enter(placed: PlacedShard): void {
    this.storage.enterWith(placed);
  }
}

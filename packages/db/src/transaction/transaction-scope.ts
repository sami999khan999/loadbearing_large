import { AsyncLocalStorage } from "../import.js";
import type { DrizzleClient } from "../primitive/index.js";

// The seam BaseRepository reads. One instance, shared by the unit of work and
// every repository the container builds, so "am I in a transaction" has one answer.
export class TransactionScope {
  private readonly storage = new AsyncLocalStorage<DrizzleClient>();

  public current(): DrizzleClient | undefined {
    return this.storage.getStore();
  }

  public async within<T>(tx: DrizzleClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}

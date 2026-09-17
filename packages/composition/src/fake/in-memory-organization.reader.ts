import { type OrganizationId, OrganizationReader } from "../import.js";

// Pages the way the real reader does — keyset on the id, exclusive. A fake that returned
// every tenant at once would let a consumer that never advances its cursor pass.
export class InMemoryOrganizationReader extends OrganizationReader {
  private readonly ids: readonly OrganizationId[];

  public constructor(ids: readonly OrganizationId[] = []) {
    super();
    this.ids = [...ids].sort();
  }

  public override page(
    after: OrganizationId | null,
    limit: number,
  ): Promise<readonly OrganizationId[]> {
    const rest = after ? this.ids.filter((id) => id > after) : this.ids;
    return Promise.resolve(rest.slice(0, limit));
  }
}

import { asc, gt, type OrganizationId, type OrganizationReader } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { organizations } from "../schema/index.js";

// The catalog read every per-tenant loop starts from, and the one read in this system
// that is cross-tenant by definition rather than by accident.
export class PgOrganizationReader extends BaseRepository implements OrganizationReader {
  public async page(
    after: OrganizationId | null,
    limit: number,
  ): Promise<readonly OrganizationId[]> {
    const rows = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(after ? gt(organizations.id, after) : undefined)
      .orderBy(asc(organizations.id))
      .limit(limit);

    return rows.map((row) => row.id);
  }
}

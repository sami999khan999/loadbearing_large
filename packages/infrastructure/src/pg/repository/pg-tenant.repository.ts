import {
  eq,
  type OrganizationId,
  type Placement,
  type TenantRecord,
  type TenantRepository,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { organizations } from "../schema/index.js";

export class PgTenantRepository extends BaseRepository implements TenantRepository {
  // `organizations` is the catalog's own table.
  protected override readonly placement: Placement = "catalog";

  public async findBy(organizationId: OrganizationId): Promise<TenantRecord | null> {
    const rows = await this.db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        isPlatform: organizations.isPlatform,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return rows[0] ?? null;
  }

  // One statement, and every referring table's `ON DELETE CASCADE` does the rest. The
  // seven partitioned referrers are dropped before this runs, not cascaded.
  public async delete(organizationId: OrganizationId): Promise<void> {
    await this.db.delete(organizations).where(eq(organizations.id, organizationId));
  }
}

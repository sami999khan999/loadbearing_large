import {
  asc,
  eq,
  inArray,
  type OrganizationId,
  type PaginationQuery,
  type RoleId,
  type RolePage,
  type RoleRecord,
  type RoleRepository,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { rolePermissions, roles } from "../schema/index.js";

export class PgRoleRepository extends BaseRepository implements RoleRepository {
  // Three queries, fixed — never one per role. The grants are fetched for the whole
  // page with a single `IN`, because a per-role query is an N+1 that is invisible at
  // four seeded roles and is the whole cost of the request at four hundred.
  public async list(organizationId: OrganizationId, page: PaginationQuery): Promise<RolePage> {
    const rows = await this.db
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        description: roles.description,
        scope: roles.scope,
        isSystem: roles.isSystem,
      })
      .from(roles)
      // Every read narrows by tenant. There is no code path here that could omit it.
      .where(eq(roles.organizationId, organizationId))
      // By creation, so a page boundary is stable between requests. Ordering by name
      // would reshuffle the moment somebody renames a role mid-pagination.
      .orderBy(asc(roles.createdAt))
      .limit(page.limit)
      .offset(page.offset);

    // The total for the whole tenant, not for the page — that is what a pager needs,
    // and it is why it cannot be derived from `rows.length`.
    const [counted] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(roles)
      .where(eq(roles.organizationId, organizationId));

    const ids = rows.map((row) => row.id);
    const grants =
      ids.length === 0
        ? []
        : await this.db
            .select({ roleId: rolePermissions.roleId, permission: rolePermissions.permission })
            .from(rolePermissions)
            .where(
              // Narrowed by role *and* by tenant. `role_permissions` carries its own
              // `organization_id`, so the second predicate costs an index lookup and
              // removes any chance of a cross-tenant row arriving through a role id.
              sql`${inArray(rolePermissions.roleId, ids)} and ${eq(rolePermissions.organizationId, organizationId)}`,
            );

    const byRole = new Map<string, string[]>();
    for (const grant of grants) {
      const bucket = byRole.get(grant.roleId);
      if (bucket) bucket.push(grant.permission);
      else byRole.set(grant.roleId, [grant.permission]);
    }

    const items: RoleRecord[] = rows.map((row) => ({
      id: row.id as RoleId,
      key: row.key,
      name: row.name,
      description: row.description,
      scope: row.scope,
      isSystem: row.isSystem,
      // Sorted, so two runs against the same data produce the same response and a
      // snapshot test is not a coin toss.
      permissions: (byRole.get(row.id) ?? []).sort(),
    }));

    return { items, total: counted?.total ?? 0 };
  }
}

import {
  and,
  asc,
  eq,
  type MemberPage,
  type MemberRecord,
  type MemberRepository,
  type OrganizationId,
  type PaginationQuery,
  type RoleId,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { memberships, roles, users } from "../schema/index.js";

export class PgMemberRepository extends BaseRepository implements MemberRepository {
  // Two queries, fixed: the page and the total. The joins are in the page query rather
  // than fetched per row, because a per-member lookup is an N+1 that is invisible at
  // four members and the whole cost of the request at four hundred.
  public async list(organizationId: OrganizationId, page: PaginationQuery): Promise<MemberPage> {
    const rows = await this.db
      .select({
        userId: memberships.userId,
        name: users.name,
        email: users.email,
        roleId: memberships.roleId,
        roleKey: roles.key,
        roleName: roles.name,
        joinedAt: memberships.createdAt,
        deactivatedAt: users.deactivatedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      // Every read narrows by tenant. There is no code path here that could omit it.
      .where(eq(memberships.organizationId, organizationId))
      // By joining order, so a page boundary is stable between requests.
      .orderBy(asc(memberships.createdAt))
      .limit(page.limit)
      .offset(page.offset);

    const [counted] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.organizationId, organizationId));

    const items: MemberRecord[] = rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      roleId: row.roleId as RoleId,
      roleKey: row.roleKey,
      roleName: row.roleName,
      joinedAt: row.joinedAt,
      deactivated: row.deactivatedAt !== null,
    }));

    return { items, total: counted?.total ?? 0 };
  }

  public async existsByEmail(organizationId: OrganizationId, email: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(sql`lower(${users.email})`, email.toLowerCase()),
        ),
      )
      .limit(1);

    return row !== undefined;
  }
}

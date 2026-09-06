import { and, asc, eq, isNull, type OrganizationId, sql, type UserId } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { memberships, organizations, roles, users } from "../schema/index.js";

// One tenant a user may switch to. The same shape `MembershipReader` in `auth`
// declares, restated here because this package cannot import that one.
export interface OrganizationSummary {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly roleName: string;
}

// Satisfies `MembershipReader` structurally, because `auth` already depends on this
// package. See docs/reference/enrollers.md.
export class PgMembershipReader extends BaseRepository {
  // The switcher renders every row `organizationsFor` returns, so an unbounded read is a
  // list that grows without limit. Past this a user needs search, not a longer list.
  private static readonly MAX_ORGANIZATIONS = 100;

  // Once per sign-in, not per request. Last switched to while still a member, oldest
  // membership otherwise — so the answer is stable rather than planner-dependent.
  public async activeOrganizationFor(userId: UserId): Promise<OrganizationId | null> {
    const [row] = await this.db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.userId, userId))
      // `true` sorts first under `desc`. A user with no preference compares as null on
      // every row, and `nulls last` makes that a tie rather than a winner.
      .orderBy(
        sql`(${memberships.organizationId} = ${users.lastActiveOrganizationId}) desc nulls last`,
        asc(memberships.createdAt),
      )
      .limit(1);

    return (row?.organizationId as OrganizationId | undefined) ?? null;
  }

  // The switch endpoint's whole authorization. Indexed by `memberships_uq`.
  public async isMember(userId: UserId, organizationId: OrganizationId): Promise<boolean> {
    const [row] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
      .limit(1);

    return row !== undefined;
  }

  // One row on `memberships_uq`, and the column it reads is why deactivation is per
  // membership: the same person stays active everywhere else.
  public async isActive(userId: UserId, organizationId: OrganizationId): Promise<boolean> {
    const [row] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, userId),
          isNull(memberships.deactivatedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  // Oldest first, matching the fallback order above, so the switcher's list and the
  // sign-in default agree about which tenant is "first".
  public async organizationsFor(userId: UserId): Promise<readonly OrganizationSummary[]> {
    // Two joins, still one round trip. `memberships_user_uq` makes the role side
    // single-valued, so this cannot fan out a tenant into two rows.
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        roleName: roles.name,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt))
      .limit(PgMembershipReader.MAX_ORGANIZATIONS);

    return rows;
  }
}

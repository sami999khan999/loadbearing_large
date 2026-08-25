import { asc, eq, type OrganizationId, type UserId } from "../import.js";
import { BaseRepository } from "../primitive/index.js";
import { memberships } from "../schema/index.js";

// Satisfies `MembershipReader` from `@loadbearing/auth` structurally — it cannot import it,
// because `auth` already depends on this package. The binding is checked where the two
// meet, in `Container` (17); a signature drift fails composition's typecheck, not this one.
export class PgMembershipReader extends BaseRepository {
  // Runs once per sign-in, not per request — the answer is pinned onto the session row.
  // Ordered by creation so a user in two organizations lands in the same one every time
  // rather than wherever the planner happened to look first.
  public async activeOrganizationFor(userId: UserId): Promise<OrganizationId | null> {
    const [row] = await this.db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt))
      .limit(1);

    return (row?.organizationId as OrganizationId | undefined) ?? null;
  }
}

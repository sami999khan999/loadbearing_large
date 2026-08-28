import { and, eq, type OrganizationId, sql, type UserId, Uuid } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { memberships, organizations, roles } from "../schema/index.js";

// The role the first person through the door gets, and the role everyone after them
// gets. Both are seeded by `SystemRoleSeed`; an organization missing either is an
// organization the seed never ran against, and enrolment declines rather than guesses.
const FOUNDER_ROLE = "owner";
const JOINER_ROLE = "member";

// An arbitrary but fixed namespace for `pg_advisory_xact_lock`'s two-argument form, so
// this lock can never collide with an advisory lock taken for some other reason.
const LOCK_NAMESPACE = 0x6c62_0001 | 0;

// Postgres advisory locks are keyed on integers, and an organization id is a uuid. The
// first eight hex digits are enough — a collision costs two enrolments serialising
// against each other, which is what they were going to do anyway.
function lockKey(organizationId: string): number {
  return Number.parseInt(organizationId.replaceAll("-", "").slice(0, 8), 16) | 0;
}

// Satisfies `MembershipEnroller` from `@loadbearing/auth` structurally, for the same
// reason `PgMembershipReader` satisfies `MembershipReader`: `auth` already depends on
// this package, so the binding is checked in `Container` (17) rather than here.
export class PgMembershipEnroller extends BaseRepository {
  // `undefined` switches enrolment off entirely, which is the default. A deployment
  // that has built invitations wants exactly that: an unaffiliated sign-up gets no
  // membership, `MembershipReader` returns null, and the session is refused.
  private organizationSlug: string | undefined;

  public withOrganizationSlug(slug: string | undefined): this {
    this.organizationSlug = slug;
    return this;
  }

  // Runs once per user, on the first session they ever open — `activeOrganizationFor`
  // answers on every one after that, so the queries below are not on the sign-in path.
  public async enrol(userId: UserId): Promise<OrganizationId | null> {
    const slug = this.organizationSlug;
    if (!slug) return null;

    const [organization] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!organization) return null;
    const organizationId = organization.id;

    // The whole read-decide-write in one transaction behind an advisory lock. Without
    // it, two sign-ups racing on an empty organization both read "no members yet" and
    // both land as `owner` — and `owner` is the wildcard role, so the cost of losing
    // that race is a second account with every permission in the registry.
    return this.database.client.transaction(async (tx) =>
      this.scope.within(tx, async () => {
        await this.db.execute(
          sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${lockKey(organizationId)})`,
        );

        // Idempotent, and checked inside the lock: a retried request must return the
        // organization the first attempt chose rather than enrol the user twice.
        const [existing] = await this.db
          .select({ organizationId: memberships.organizationId })
          .from(memberships)
          .where(eq(memberships.userId, userId))
          .limit(1);

        // Cast for the same reason `PgMembershipReader` casts: `memberships` declares
        // its FK as a plain `uuid`, and the brand lives on `organizations.id`.
        if (existing) return existing.organizationId as OrganizationId;

        const [occupant] = await this.db
          .select({ id: memberships.id })
          .from(memberships)
          .where(eq(memberships.organizationId, organizationId))
          .limit(1);

        const key = occupant ? JOINER_ROLE : FOUNDER_ROLE;

        const [role] = await this.db
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.organizationId, organizationId), eq(roles.key, key)))
          .limit(1);

        // The seed has not run against this organization. Declining is the only safe
        // answer: inventing a role here would be inventing a permission set.
        if (!role) return null;

        await this.db
          .insert(memberships)
          .values({ id: Uuid.v7(), organizationId, userId, roleId: role.id });

        return organizationId;
      }),
    );
  }
}

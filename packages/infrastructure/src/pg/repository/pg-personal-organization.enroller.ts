import { and, eq, type OrganizationId, sql, type UserId, Uuid } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { memberships, organizations, roles, users } from "../schema/index.js";
import { SystemRoleSeed } from "../seed/index.js";

// The role a person gets in the organization they just created. There is no second
// branch here, unlike the bootstrap enroller: the tenant has exactly one member.
const FOUNDER_ROLE = "owner";

// The same fixed namespace the bootstrap enroller uses for `pg_advisory_xact_lock`'s
// two-argument form, so the two can never collide with a lock taken for another reason.
const LOCK_NAMESPACE = 0x6c62_0001 | 0;

// Keyed on the *user*, not the organization, because the organization does not exist
// yet. Two sign-ins racing on one brand-new user is the case this serialises, and
// losing that race would mean two organizations and two owner memberships for one
// person — with the session hook free to pick either.
function lockKey(userId: string): number {
  return Number.parseInt(userId.replaceAll("-", "").slice(0, 8), 16) | 0;
}

// Satisfies `MembershipEnroller` from `@loadbearing/auth` structurally, for the same
// reason `PgBootstrapMembershipEnroller` does: `auth` already depends on this package,
// so the binding is checked in `Container` (17) rather than here.
//
// The `personal` enrolment mode. A new user becomes the owner of an organization of
// their own, which is what lets a fresh clone sign up and get in with no seed run and
// no invitation — and what makes the kit multi-tenant on day one rather than after a
// rewrite.
export class PgPersonalOrganizationEnroller extends BaseRepository {
  // Built here rather than injected: it is not a seam, it is the same package's own
  // role-granting logic, and constructing it with *this* repository's transaction scope
  // is what makes its writes land inside the transaction opened below.
  private readonly systemRoles = new SystemRoleSeed(this.database, this.scope);

  // Runs once per user, on the first session they ever open — `activeOrganizationFor`
  // answers on every one after that, so none of this is on the sign-in path.
  public async enrol(userId: UserId): Promise<OrganizationId | null> {
    return this.database.client.transaction(async (tx) =>
      this.scope.within(tx, async () => {
        await this.db.execute(
          sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${lockKey(userId)})`,
        );

        // Idempotent, and checked inside the lock: a retried request must return the
        // organization the first attempt created rather than create a second one.
        const [existing] = await this.db
          .select({ organizationId: memberships.organizationId })
          .from(memberships)
          .where(eq(memberships.userId, userId))
          .limit(1);

        // Cast for the same reason `PgMembershipReader` casts: `memberships` declares
        // its FK as a plain `uuid`, and the brand lives on `organizations.id`.
        if (existing) return existing.organizationId as OrganizationId;

        const [user] = await this.db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // The hook that calls this runs inside session creation, so the row is always
        // there. Declining rather than inventing a name keeps that assumption visible.
        if (!user) return null;

        const organizationId = Uuid.v7() as OrganizationId;

        await this.db.insert(organizations).values({
          id: organizationId,
          // Derived from the id, never from the name or the email. A slug built from
          // user input needs a collision strategy and a normalisation pass, and both
          // are decisions this table does not currently need — nothing routes by slug.
          slug: `u-${userId}`,
          // The person's own name, so this package writes no English and needs no
          // locale to name a tenant.
          name: user.name,
        });

        // Reused, not reimplemented. It resolves `owner`'s wildcard through
        // `PermissionRegistry.instance.all()`, so an organization created here holds
        // exactly the grants `pnpm db:seed` would have given it.
        await this.systemRoles.run(organizationId);

        const [role] = await this.db
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.organizationId, organizationId), eq(roles.key, FOUNDER_ROLE)))
          .limit(1);

        // Unreachable unless `SystemRoleSeed` stops defining `owner`. Declining beats
        // throwing: the caller turns a null into a refused session, which is the safe
        // failure, and inventing a role here would be inventing a permission set.
        if (!role) return null;

        await this.db
          .insert(memberships)
          .values({ id: Uuid.v7(), organizationId, userId, roleId: role.id });

        return organizationId;
      }),
    );
  }
}

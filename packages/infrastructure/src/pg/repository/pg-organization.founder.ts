import {
  type ActivityLogger,
  and,
  CapabilitySet,
  eq,
  InternalError,
  type OrganizationId,
  Principal,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository, type Database } from "../primitive/index.js";
import { memberships, organizations, roles } from "../schema/index.js";
import { SystemRoleSeed } from "../seed/index.js";
import type { TransactionScope } from "../transaction/index.js";

// The role the person who founds a tenant gets. There is no second branch: a founded
// organization has exactly one member.
const FOUNDER_ROLE = "owner";

// Satisfies `OrganizationFounder` from `@loadbearing/auth` structurally — `auth`
// already depends on this package, so the binding is checked in `Container`.
//
// One implementation of "create a tenant and own it", called from two places: the
// personal enroller at a first sign-in, and the create endpoint behind the "New
// organization" button. Both must produce an organization indistinguishable from a
// seeded one, which is why `SystemRoleSeed` is reused rather than restated.
export class PgOrganizationFounder extends BaseRepository {
  private readonly systemRoles = new SystemRoleSeed(this.database, this.scope);

  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly activity: ActivityLogger,
  ) {
    super(database, scope);
  }

  // `this.db.transaction`, not `this.database.client.transaction`: called inside the
  // enroller's open transaction this becomes a savepoint and commits with it; called
  // standalone it is a transaction of its own. Either way the seed and the audit row
  // land in the same unit as the organization.
  public async found(userId: UserId, name: string, slug?: string): Promise<OrganizationId> {
    return this.db.transaction(async (tx) =>
      this.scope.within(tx, async () => {
        const organizationId = Uuid.v7() as OrganizationId;

        await this.db.insert(organizations).values({
          id: organizationId,
          // Derived from an id, never from the name: a slug built from user input needs
          // a normalisation pass and a collision strategy, and nothing routes by slug.
          slug: slug ?? `o-${organizationId}`,
          name,
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

        // Unreachable unless `SystemRoleSeed` stops defining `owner`. Throwing rolls
        // the whole tenant back, which beats a tenant nobody can administer.
        if (!role) throw new InternalError(new Error("SystemRoleSeed defines no owner role."));

        await this.db
          .insert(memberships)
          .values({ id: Uuid.v7(), organizationId, userId, roleId: role.id });

        // Recorded as the tenant that was just created — the caller's principal, when
        // there is one, is scoped to a different one. An empty capability set: the
        // logger reads only the organization and the actor off it.
        await this.activity.record(
          new Principal(organizationId, userId, CapabilitySet.empty()),
          "organization.created",
          { name },
        );

        return organizationId;
      }),
    );
  }
}

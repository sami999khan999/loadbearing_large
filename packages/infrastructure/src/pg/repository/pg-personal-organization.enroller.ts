import { eq, type OrganizationId, sql, type UserId } from "../../import.js";
import { BaseRepository, type Database } from "../primitive/index.js";
import { memberships, users } from "../schema/index.js";
import type { TransactionScope } from "../transaction/index.js";
import type { PgOrganizationFounder } from "./pg-organization.founder.js";

// The same fixed namespace the bootstrap enroller and the invitation claimer use for
// `pg_advisory_xact_lock`'s two-argument form, so none can collide with a lock taken
// for another reason — and so a claim and an enrolment for one user serialise.
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
// rewrite. The tenant itself is made by `PgOrganizationFounder`; this class owns only
// the lock and the "not if they already have one" decision.
export class PgPersonalOrganizationEnroller extends BaseRepository {
  // Must share this repository's `TransactionScope`, or the founder's savepoint opens
  // on the pool instead of inside the locked transaction below.
  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly founder: PgOrganizationFounder,
  ) {
    super(database, scope);
  }

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
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // The hook that calls this runs inside session creation, so the row is always
        // there. Declining rather than inventing a name keeps that assumption visible.
        if (!user) return null;

        // The person's own name, so this package writes no English and needs no locale
        // to name a tenant; the slug from their id, because nothing routes by slug and a
        // slug built from a name needs a collision strategy this table does not have.
        return this.founder.found(userId, user.name, `u-${userId}`);
      }),
    );
  }
}

import {
  type ActivityLogger,
  and,
  asc,
  CapabilitySet,
  eq,
  gt,
  type OrganizationId,
  Principal,
  type SQL,
  sql,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository, type Database } from "../primitive/index.js";
import { invitations, memberships, organizations, users } from "../schema/index.js";
import type { TransactionScope } from "../transaction/index.js";

// The same namespace and the same user-keyed lock the personal enroller takes, on
// purpose: a claim and an enrolment racing for one brand-new user serialise against
// each other rather than producing a membership and a personal organization both.
const LOCK_NAMESPACE = 0x6c62_0001 | 0;

function lockKey(userId: string): number {
  return Number.parseInt(userId.replaceAll("-", "").slice(0, 8), 16) | 0;
}

// What the landing page renders before anyone is signed in. The same shape
// `InvitationClaimer` in `auth` declares, restated because this package cannot import it.
export interface InvitationPreview {
  readonly organizationName: string;
  readonly email: string;
  readonly expired: boolean;
}

// Satisfies `InvitationClaimer` from `@loadbearing/auth` structurally, for the same
// reason every adapter beside it does.
//
// Deliberately not tenant-scoped: the caller arrives holding a token or a user id and
// no organization, exactly as `PgMembershipReader.activeOrganizationFor` does. The
// tenant is the *answer*. What scopes a claim instead is the verified-address check
// in `claim`, which is the one predicate that must never be relaxed.
export class PgInvitationClaimer extends BaseRepository {
  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly activity: ActivityLogger,
  ) {
    super(database, scope);
  }

  public async preview(token: string): Promise<InvitationPreview | null> {
    const [row] = await this.db
      .select({
        organizationName: organizations.name,
        email: invitations.email,
        // Database time — the same clock the claim below compares against.
        expired: sql<boolean>`${invitations.expiresAt} <= now()`,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(eq(invitations.token, token))
      .limit(1);

    return row ?? null;
  }

  public claimByToken(userId: UserId, token: string): Promise<OrganizationId | null> {
    return this.claim(userId, eq(invitations.token, token));
  }

  public claimPending(userId: UserId): Promise<OrganizationId | null> {
    return this.claim(userId);
  }

  private async claim(userId: UserId, match?: SQL): Promise<OrganizationId | null> {
    return this.database.client.transaction(async (tx) =>
      this.scope.within(tx, async () => {
        await this.db.execute(
          sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${lockKey(userId)})`,
        );

        const [user] = await this.db
          .select({ email: users.email, emailVerified: users.emailVerified })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // The security property, and the only one. Without a verified address anyone
        // could register as the invited email and walk into the tenant; with it, the
        // mailbox the invitation was sent to is the credential and the token is a
        // lookup key. Under `AUTH_REQUIRE_EMAIL_VERIFICATION=false` this never
        // matches — invitations fail closed there, and that is documented.
        if (!user?.emailVerified) return null;

        const [invitation] = await this.db
          .select({
            id: invitations.id,
            organizationId: invitations.organizationId,
            roleId: invitations.roleId,
          })
          .from(invitations)
          .where(
            and(
              eq(sql`lower(${invitations.email})`, user.email.toLowerCase()),
              gt(invitations.expiresAt, sql`now()`),
              match,
            ),
          )
          .orderBy(asc(invitations.createdAt))
          .limit(1);

        if (!invitation) return null;

        // Idempotent under `memberships_uq (organization_id, user_id)`: someone who is
        // already a member keeps the role they have, and the invitation is consumed.
        await this.db
          .insert(memberships)
          .values({
            id: Uuid.v7(),
            organizationId: invitation.organizationId,
            userId,
            roleId: invitation.roleId,
          })
          .onConflictDoNothing();

        await this.db.delete(invitations).where(eq(invitations.id, invitation.id));

        // Written as the tenant being joined — the fact is theirs, not the actor's
        // current organization's. The same construction `PgOrganizationFounder` uses.
        await this.activity.record(
          new Principal(invitation.organizationId, userId, CapabilitySet.empty()),
          "member.joined",
          { invitationId: invitation.id, roleId: invitation.roleId },
        );

        return invitation.organizationId;
      }),
    );
  }
}

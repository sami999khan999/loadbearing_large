import type { OrganizationId, UserId } from "../import.js";

// The write half of the pair `MembershipReader` reads. It exists because nothing else
// in the repository ever inserts into `memberships`, and `MembershipReader` returning
// null aborts the session — so without a first membership every sign-in on a fresh
// clone fails, correctly, forever.
//
// Called once per user, from `databaseHooks.session.create.before` — not
// `user.create.after`, which Better Auth queues until after the session hook has
// already refused. `InvitationClaimingEnroller` wraps every mode, so an invited
// address is claimed before the mode's own answer is consulted.
export abstract class MembershipEnroller {
  // The organization the user was enrolled into, or null when there was none to enrol
  // them into. Null is not an error here: a deployment that has switched registration
  // off returns it on every sign-up, and `MembershipReader` then aborts the session
  // exactly as it does today. Fail-closed is the whole point.
  public abstract enrol(userId: UserId): Promise<OrganizationId | null>;
}

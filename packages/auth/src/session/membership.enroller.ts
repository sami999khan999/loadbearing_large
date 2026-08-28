import type { OrganizationId, UserId } from "../import.js";

// The write half of the pair `MembershipReader` reads. It exists because nothing else
// in the repository ever inserts into `memberships`, and `MembershipReader` returning
// null aborts the session — so without a first membership every sign-in on a fresh
// clone fails, correctly, forever.
//
// Called once per user, from `databaseHooks.user.create.after`, and never again. A
// membership granted at any other moment is an invitation or an admin action, which
// is product surface rather than authentication.
export abstract class MembershipEnroller {
  // The organization the user was enrolled into, or null when there was none to enrol
  // them into. Null is not an error here: a deployment that has switched registration
  // off returns it on every sign-up, and `MembershipReader` then aborts the session
  // exactly as it does today. Fail-closed is the whole point.
  public abstract enrol(userId: UserId): Promise<OrganizationId | null>;
}

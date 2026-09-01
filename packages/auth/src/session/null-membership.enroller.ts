import type { OrganizationId, UserId } from "../import.js";
import { MembershipEnroller } from "./membership.enroller.js";

// The `invite` enrolment mode: nobody enrols themselves. A sign-up succeeds and
// produces an account, the first session is refused because there is no membership,
// and joining becomes something an invitation grants.
//
// It lives beside its port rather than in `infrastructure` because it touches no
// database — putting it there would mean a Postgres package holding a class with no
// query in it, and a reader looking for the "no enrolment" branch would have to know
// to look in a persistence adapter to find out that there isn't one.
export class NullMembershipEnroller extends MembershipEnroller {
  // Null on every call, which is the same answer the other two give when they decline.
  // `MembershipReader` turns it into a refused session — fail-closed, and the reason
  // this is a real implementation rather than a missing binding.
  //
  // Not `async`: there is nothing to await, and the port is satisfied by returning the
  // resolved promise directly — the same shape the stubs in `src/tables/` use.
  public enrol(_userId: UserId): Promise<OrganizationId | null> {
    return Promise.resolve(null);
  }
}

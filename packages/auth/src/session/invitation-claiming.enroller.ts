import type { OrganizationId, UserId } from "../import.js";
import type { InvitationClaimer } from "./invitation.claimer.js";
import { MembershipEnroller } from "./membership.enroller.js";

// Wraps whichever enroller `AUTH_ENROLMENT_MODE` picked: an invited address joins the
// organization that invited it, and only an address nobody invited falls through to
// the mode's own answer. Around `NullMembershipEnroller` this is what makes `invite`
// mean "invitation is the only door" rather than "refuse everyone".
//
// The order is the decision the user made about tenancy: an invited person does not
// also get a personal organization. Swapping the two lines is the other model.
export class InvitationClaimingEnroller extends MembershipEnroller {
  public constructor(
    private readonly claimer: InvitationClaimer,
    private readonly inner: MembershipEnroller,
  ) {
    super();
  }

  public async enrol(userId: UserId): Promise<OrganizationId | null> {
    return (await this.claimer.claimPending(userId)) ?? this.inner.enrol(userId);
  }
}

import { oc } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { MemberContract } from "./member.contract.js";

export class MemberProcedures {
  private constructor() {}

  public static readonly list = oc
    .route({ method: "GET", path: "/members" })
    .input(MemberContract.listQuery)
    .output(Envelope.paginated(MemberContract.entity));

  public static readonly listInvitations = oc
    .route({ method: "GET", path: "/members/invitations" })
    .input(MemberContract.listQuery)
    .output(Envelope.paginated(MemberContract.invitation));

  public static readonly invite = oc
    .route({ method: "POST", path: "/members/invitations" })
    .input(MemberContract.invite)
    .output(MemberContract.invitation);

  public static readonly revokeInvitation = oc
    .route({ method: "DELETE", path: "/members/invitations/{invitationId}" })
    .input(MemberContract.revoke)
    .output(Envelope.acknowledged);

  // The object the merge point in `procedure/index.ts` mounts. One place to add a
  // procedure to, rather than two.
  public static readonly all = {
    list: MemberProcedures.list,
    listInvitations: MemberProcedures.listInvitations,
    invite: MemberProcedures.invite,
    revokeInvitation: MemberProcedures.revokeInvitation,
  } as const;
}

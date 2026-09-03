import type {
  ApiClient,
  InvitationDto,
  InviteMemberInput,
  RevokeInvitationInput,
} from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

// A class of static hook factories, as `AccountMutations` is: the hook rules apply at
// the call site, and `MemberMutations.useInvite(client)` is called unconditionally at
// the top of a component.
export class MemberMutations {
  private constructor() {}

  // Invalidates the whole namespace rather than only the invitation list: a re-invite
  // to an address replaces a pending row, and the member list is what the page shows
  // beside it, so both refetch together.
  public static useInvite(client: ApiClient) {
    return useAppMutation<InvitationDto, InviteMemberInput>({
      mutationFn: (input) => client.member.invite(input),
      invalidates: [QueryKeys.member.all()],
    });
  }

  public static useRevokeInvitation(client: ApiClient) {
    return useAppMutation<{ ok: true }, RevokeInvitationInput>({
      mutationFn: (input) => client.member.revokeInvitation(input),
      invalidates: [QueryKeys.member.all()],
    });
  }
}

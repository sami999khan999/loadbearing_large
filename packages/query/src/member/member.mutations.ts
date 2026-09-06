import type {
  ApiClient,
  ChangeMemberRoleInput,
  InvitationDto,
  InviteMemberInput,
  MemberDto,
  RevokeInvitationInput,
  SetMemberActiveInput,
} from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

// Static hook factories: the hook rules apply at the call site, and each is called
// unconditionally at the top of a component.
export class MemberMutations {
  private constructor() {}

  // The whole namespace, not just the invitation list: a re-invite replaces a pending row
  // and the member list sits beside it, so both refetch together.
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

  // `rbac.all()` too: the effective-permission key is per user, and a role change is
  // the write that changes what it answers.
  public static useChangeRole(client: ApiClient) {
    return useAppMutation<MemberDto, ChangeMemberRoleInput>({
      mutationFn: (input) => client.member.changeRole(input),
      invalidates: [QueryKeys.member.all(), QueryKeys.rbac.all()],
    });
  }

  public static useDeactivate(client: ApiClient) {
    return useAppMutation<MemberDto, SetMemberActiveInput>({
      mutationFn: (input) => client.member.deactivate(input),
      invalidates: [QueryKeys.member.all()],
    });
  }

  public static useReactivate(client: ApiClient) {
    return useAppMutation<MemberDto, SetMemberActiveInput>({
      mutationFn: (input) => client.member.reactivate(input),
      invalidates: [QueryKeys.member.all()],
    });
  }
}

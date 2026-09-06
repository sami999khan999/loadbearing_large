import type { PermissionKey } from "../import.js";

// One entry per path in `MemberProcedures`. Every write is gated on `member.invite`:
// a role that can send an invitation must be able to take it back.
export const memberProcedurePermissions = {
  "member.list": "member.read",
  "member.listInvitations": "member.read",
  "member.invite": "member.invite",
  "member.revokeInvitation": "member.invite",
  "member.changeRole": "member.role.change",
  // Both on `member.deactivate`: a role that can remove someone's access must be able
  // to give it back, or an accident needs an owner to undo it.
  "member.deactivate": "member.deactivate",
  "member.reactivate": "member.deactivate",
} as const satisfies Record<string, PermissionKey>;

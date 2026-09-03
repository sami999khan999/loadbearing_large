import type { PermissionKey } from "../import.js";

// One entry per procedure path in `MemberProcedures`. Reads are gated on `member.read`
// and every write on `member.invite` — revoking is the other half of inviting, and a
// role that can send an invitation must be able to take it back.
export const memberProcedurePermissions = {
  "member.list": "member.read",
  "member.listInvitations": "member.read",
  "member.invite": "member.invite",
  "member.revokeInvitation": "member.invite",
} as const satisfies Record<string, PermissionKey>;

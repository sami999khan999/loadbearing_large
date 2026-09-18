export const memberActions = {
  "member.invited": { label: "Member invited" },
  "member.joined": { label: "Member joined" },
  "member.invitation.revoked": { label: "Invitation revoked" },
  "member.role.changed": { label: "Member role changed" },
  // Two actions from one call site, which is why both are entries: the use-case picks
  // between them on the value it is writing.
  "member.deactivated": { label: "Member deactivated" },
  "member.reactivated": { label: "Member reactivated" },
} as const;

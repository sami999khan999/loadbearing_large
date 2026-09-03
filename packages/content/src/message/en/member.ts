export const member = {
  "member.title": "Members",
  "member.subtitle": "Who belongs to this organization, and who has been asked to join.",
  "member.column.name": "Name",
  "member.column.email": "Email",
  "member.column.role": "Role",
  "member.column.joined": "Joined",
  "member.badge.owner": "Owner",
  "member.badge.deactivated": "Deactivated",
  "member.empty": "Nobody here yet.",

  "member.invitation.title": "Pending invitations",
  "member.invitation.empty": "No pending invitations.",
  "member.invitation.invitedBy": "Invited by {name}",
  "member.invitation.expires": "Expires {date}",
  "member.invitation.revoke": "Revoke",

  "member.invite.title": "Invite someone",
  "member.invite.email": "Email address",
  "member.invite.role": "Role",
  "member.invite.submit": "Send invitation",
  "member.invite.sent": "Invitation sent to {email}. It expires in seven days.",
  // The one failure worth its own sentence: the generic conflict copy talks about a
  // concurrent edit, which is not what happened.
  "member.invite.alreadyMember": "That address already belongs to a member of this organization.",
} as const;

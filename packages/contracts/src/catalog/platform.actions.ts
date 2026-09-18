export const platformActions = {
  "platform.policy.changed": { label: "Platform policy changed" },
  "platform.restore.requested": { label: "Restore requested" },
  "tenant.retention.changed": { label: "Tenant retention changed" },
  "tenant.deleted": { label: "Tenant deleted" },
  "tenant.export_requested": { label: "Tenant export requested" },
  // Not a platform admin's doing — enrolment writes it — but it is the tenant
  // lifecycle, which is what the rest of this fragment is.
  "organization.created": { label: "Organization created" },
} as const;

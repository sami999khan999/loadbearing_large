export const platformActions = {
  "platform.policy.changed": { label: "Platform policy changed" },
  "platform.projection.paused": { label: "Projection paused" },
  "platform.projection.resumed": { label: "Projection resumed" },
  "platform.restore.requested": { label: "Restore requested" },
  "platform.reproject.requested": { label: "Re-projection requested" },
  "tenant.retention.changed": { label: "Tenant retention changed" },
  // Two, because the delete is a job now: one says who asked and when, the other says
  // what it cost. A failed job leaves the first without the second, which is the point.
  "tenant.delete_requested": { label: "Tenant delete requested" },
  "tenant.deleted": { label: "Tenant deleted" },
  "tenant.export_requested": { label: "Tenant export requested" },
  // Not a platform admin's doing — enrolment writes it — but it is the tenant
  // lifecycle, which is what the rest of this fragment is.
  "organization.created": { label: "Organization created" },
} as const;

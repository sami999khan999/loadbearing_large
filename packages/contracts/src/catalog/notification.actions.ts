// When a tenant's members get their daily digest (`26.7`). One person's preference is not
// audited: it changes only what reaches them.
export const notificationActions = {
  "notification.digest.rescheduled": { label: "Digest hour changed" },
} as const;

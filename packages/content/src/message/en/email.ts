// Server-only copy. Reachable through `SERVER_CATALOG` and nothing else, which is what
// keeps it out of every client bundle — the CI grep for "email.digest." is the proof.
export const email = {
  "email.digest.subject": "Your daily digest — {count} updates",
  "email.digest.subjectEmpty": "Your daily digest",
  "email.digest.greeting": "Hello {name},",
  "email.digest.intro": "Here is what changed across your goals since yesterday.",
  "email.digest.empty": "Nothing changed since yesterday. Enjoy the quiet.",
  "email.digest.viewAll": "Open the dashboard",
  "email.digest.footer": "You are receiving this because you belong to {organization}.",
  "email.digest.unsubscribe": "Change how often you hear from us",
} as const;

export const nav = {
  "nav.roles": "Roles",
  "nav.members": "Members",
  "nav.apiKeys": "API keys",
  "nav.documents": "Documents",

  // ── the home page ──
  "nav.home.title": "{organization}",
  // One sentence rather than two fields, because a translation may want the role and
  // the tenant in the other order.
  "nav.home.role": "You are {role} here.",
  // Not "{count} members": `Translator` interpolates and does not pluralise, so a
  // count of 1 would read "1 members" in every locale that inflects.
  "nav.home.members": "Members: {count}",
  "nav.home.signedOut": "Sign in to continue.",
  "nav.home.goToSignIn": "Sign in",
} as const;

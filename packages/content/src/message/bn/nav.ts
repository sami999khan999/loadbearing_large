import type { NamespaceBundle } from "../namespace.js";

// Partial by design — anything missing falls back to English.
export const nav: NamespaceBundle<"nav"> = {
  "nav.roles": "ভূমিকা",
  "nav.members": "সদস্যরা",

  "nav.home.title": "{organization}",
  "nav.home.role": "এখানে আপনি {role}।",
  "nav.home.members": "সদস্য: {count}",
  "nav.home.signedOut": "চালিয়ে যেতে সাইন ইন করুন।",
  "nav.home.goToSignIn": "সাইন ইন",
};

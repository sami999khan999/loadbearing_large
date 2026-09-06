import type { NamespaceBundle } from "../namespace.js";

// Total, not partial: `NamespaceBundle` is a `Record`, so an `en` key added without a
// translation fails `tsc` rather than rendering an English sentence on a Bengali page.
export const nav: NamespaceBundle<"nav"> = {
  "nav.roles": "ভূমিকা",
  "nav.members": "সদস্যরা",
  "nav.apiKeys": "API কী",

  "nav.home.title": "{organization}",
  "nav.home.role": "এখানে আপনি {role}।",
  "nav.home.members": "সদস্য: {count}",
  "nav.home.signedOut": "চালিয়ে যেতে সাইন ইন করুন।",
  "nav.home.goToSignIn": "সাইন ইন",
};

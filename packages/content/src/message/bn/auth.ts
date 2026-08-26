import type { NamespaceBundle } from "../namespace.js";

// Partial by design — anything missing falls back to English.
export const auth: NamespaceBundle<"auth"> = {
  "auth.signIn": "সাইন ইন",
  "auth.signOut": "সাইন আউট",
  "auth.email": "ইমেইল",
  "auth.password": "পাসওয়ার্ড",
  "auth.signInFailed": "ইমেইল ও পাসওয়ার্ড মেলেনি।",
};

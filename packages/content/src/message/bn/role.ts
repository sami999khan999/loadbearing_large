import type { NamespaceBundle } from "../namespace.js";

// Partial by design — anything missing falls back to English.
export const role: NamespaceBundle<"role"> = {
  "role.title": "ভূমিকা",
  "role.subtitle": "এই প্রতিষ্ঠানে প্রতিটি ভূমিকা কী করতে পারে।",
  "role.column.permission": "অনুমতি",
  "role.badge.system": "অন্তর্নির্মিত",
  "role.hint.owner": "মালিক ভূমিকাটি নতুনগুলি সহ প্রতিটি অনুমতি পায়।",
  "role.empty": "এখনও কোনো ভূমিকা নেই। অন্তর্নির্মিত চারটি তৈরি করতে `pnpm db:seed` চালান।",
};

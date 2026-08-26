import type { NamespaceBundle } from "../namespace.js";

// Partial by design — anything missing falls back to English.
export const common: NamespaceBundle<"common"> = {
  "action.save": "সংরক্ষণ",
  "action.cancel": "বাতিল",
  "action.delete": "মুছে ফেলুন",
  "state.loading": "লোড হচ্ছে…",
  "state.allowed": "অনুমোদিত",
  "state.denied": "অননুমোদিত",
};

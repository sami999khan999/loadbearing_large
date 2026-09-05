import type { NamespaceBundle } from "../namespace.js";

// Partial by design: `error.serverOnly` is read by a developer in a console, so English
// is the right answer and the fallback layer supplies it.
export const error: NamespaceBundle<"error"> = {
  "error.unauthorized": "চালিয়ে যেতে সাইন ইন করুন।",
  "error.forbidden": "এটি করার অনুমতি আপনার নেই।",
  "error.notFound": "আপনি যা খুঁজছেন তা আমরা পাইনি।",
  "error.unexpected": "কিছু ভুল হয়েছে। আবার চেষ্টা করুন।",
  "error.field.required": "{field} আবশ্যক।",
};

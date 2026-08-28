import type { NamespaceBundle } from "../namespace.js";

// Partial by design — anything missing falls back to English.
export const email: NamespaceBundle<"email"> = {
  "email.digest.subject": "আপনার দৈনিক সারসংক্ষেপ — {count}টি হালনাগাদ",
  "email.digest.subjectEmpty": "আপনার দৈনিক সারসংক্ষেপ",
  "email.digest.greeting": "নমস্কার {name},",
  "email.digest.intro": "গতকাল থেকে আপনার লক্ষ্যগুলিতে যা পরিবর্তন হয়েছে।",
  "email.digest.empty": "গতকাল থেকে কিছুই পরিবর্তন হয়নি।",
  "email.digest.viewAll": "ড্যাশবোর্ড খুলুন",
  "email.digest.footer": "আপনি {organization}-এর সদস্য বলে এই বার্তাটি পাচ্ছেন।",

  "email.verify.subject": "আপনার ইমেল ঠিকানা নিশ্চিত করুন",
  "email.verify.body":
    "এই ঠিকানাটি নিশ্চিত করে আপনার অ্যাকাউন্ট তৈরি সম্পূর্ণ করতে নিচের লিঙ্কটি খুলুন। এটি এক ঘণ্টা পরে মেয়াদোত্তীর্ণ হবে। আপনি নিবন্ধন না করে থাকলে বার্তাটি উপেক্ষা করুন।",
  "email.verify.action": "এই ঠিকানা নিশ্চিত করুন",
  "email.reset.subject": "আপনার পাসওয়ার্ড পুনঃনির্ধারণ করুন",
  "email.reset.body":
    "নতুন পাসওয়ার্ড বেছে নিতে নিচের লিঙ্কটি খুলুন। এটি এক ঘণ্টা পরে মেয়াদোত্তীর্ণ হবে। আপনি অনুরোধ না করে থাকলে কিছুই পরিবর্তন হয়নি।",
  "email.reset.action": "নতুন পাসওয়ার্ড বেছে নিন",
};

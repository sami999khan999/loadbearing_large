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
};

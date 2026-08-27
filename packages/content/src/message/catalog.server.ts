import { email as bnEmail } from "./bn/email.js";
import { CLIENT_CATALOG, type MessageCatalog } from "./catalog.js";
import { email as enEmail } from "./en/email.js";

// Static imports, not `import()` — the one place in this package that departs from the
// literal-specifier rule, and for the opposite reason. A dynamic specifier makes rollup
// emit a chunk for the target while building the graph, and that chunk is written into
// `apps/web/.output/public/` even after `SERVER_CATALOG` itself is tree-shaken out of
// the client. Verified: with `import()` here, `email-*.js` carrying `email.digest.`
// lands in the public assets directory and 26's bundle grep fails.
//
// Loaded eagerly as a result, which is correct: the only process that ever holds this
// catalog is the worker, and it wants the copy on the first digest anyway.
export const SERVER_CATALOG: MessageCatalog = {
  en: { ...CLIENT_CATALOG.en, email: () => Promise.resolve(enEmail) },
  bn: { ...CLIENT_CATALOG.bn, email: () => Promise.resolve(bnEmail) },
};

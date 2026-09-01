// The runnable seed, above `src/` beside `drizzle.config.ts` — a build-time artefact,
// not library code. It lived at `src/pg/seed/index.ts` until `PgPersonalOrganizationEnroller`
// needed `SystemRoleSeed`: importing that folder barrel would have executed this script,
// connected to Postgres and called `process.exit` in the middle of a sign-in.

import "dotenv/config";
import { eq, Identifiers, Uuid } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";
import { organizations } from "./src/pg/schema/index.js";
import { SystemRoleSeed } from "./src/pg/seed/index.js";
import { TransactionScope } from "./src/pg/transaction/index.js";

// The same variable `apps/web/src/env.ts` reads. Naming it in both places is what
// keeps the organization the seed creates and the organization new users are enrolled
// into the same organization — a drift between the two is a sign-up that succeeds and
// a sign-in that fails, with nothing in either log saying why.
//
// Only `AUTH_ENROLMENT_MODE=bootstrap` reads it at runtime. Seeding it regardless is
// deliberate: `personal` and `invite` both leave a fresh database with no organization
// at all, and `pnpm db:studio` against an empty schema tells you nothing.
const SEED_SLUG = process.env.BOOTSTRAP_ORGANIZATION_SLUG ?? "loadbearing";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

const database = new Database({ url });

// System roles are per-tenant rows, so a fresh database needs an organization to
// hang them off before the seed has anything to write against.
const existing = await database.client
  .select({ id: organizations.id })
  .from(organizations)
  .where(eq(organizations.slug, SEED_SLUG))
  .limit(1);

const organizationId = existing[0]?.id ?? Identifiers.organizationId.parse(Uuid.v7());

if (!existing[0]) {
  await database.client
    .insert(organizations)
    .values({ id: organizationId, slug: SEED_SLUG, name: "Loadbearing" });
}

await new SystemRoleSeed(database, new TransactionScope()).run(organizationId);
await database.close();

console.log(`seed complete: ${organizationId}`);

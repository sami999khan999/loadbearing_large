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
const scope = new TransactionScope();

// One transaction, because the halves are not independently useful: an organization with
// no roles is a tenant nobody can be a member of, and a failure between them leaves one.
const organizationId = await database.client.transaction(async (tx) =>
  scope.within(tx, async () => {
    // System roles are per-tenant rows, so a fresh database needs an organization to
    // hang them off before the seed has anything to write against.
    const existing = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, SEED_SLUG))
      .limit(1);

    const id = existing[0]?.id ?? Identifiers.organizationId.parse(Uuid.v7());

    if (!existing[0]) {
      await tx.insert(organizations).values({ id, slug: SEED_SLUG, name: "Loadbearing" });
    }

    await new SystemRoleSeed(database, scope).run(id);
    return id;
  }),
);

await database.close();

console.log(`seed complete: ${organizationId}`);

// Said out loud, because the alternative is someone seeding a database, signing up, and
// landing in an organization of their own wondering where this one went.
if ((process.env.AUTH_ENROLMENT_MODE ?? "personal") !== "bootstrap") {
  console.log(
    `note: AUTH_ENROLMENT_MODE is not "bootstrap", so nothing joins ${SEED_SLUG} automatically.`,
  );
  console.log(
    "      It exists so a fresh database has a tenant to look at, and as the role template.",
  );
}

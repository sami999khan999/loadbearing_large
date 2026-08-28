import "dotenv/config";
import { eq, Identifiers, Uuid } from "../../import.js";
import { Database } from "../primitive/index.js";
import { organizations } from "../schema/index.js";
import { TransactionScope } from "../transaction/index.js";
import { SystemRoleSeed } from "./system-role.seed.js";

// The same variable `apps/web/src/env.ts` reads. Naming it in both places is what
// keeps the organization the seed creates and the organization new users are enrolled
// into the same organization — a drift between the two is a sign-up that succeeds and
// a sign-in that fails, with nothing in either log saying why.
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

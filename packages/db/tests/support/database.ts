import { Database } from "../../src/primitive/index.js";
import { organizations } from "../../src/schema/index.js";

// The local scratch stack, whose credentials are `ratchet` everywhere on purpose so
// a database nobody can debug is not the price of a secret ([11]).
const URL = "postgres://ratchet:ratchet@localhost:5432/ratchet";

export const openDatabase = (logger?: ConstructorParameters<typeof Database>[0]["logger"]) =>
  new Database(logger ? { url: URL, logger } : { url: URL });

// Every spec here runs against the seeded organization rather than creating one, so
// a failed run leaves no rows behind to confuse the next.
export const seedOrganizationId = async (database: Database) => {
  const rows = await database.client.select({ id: organizations.id }).from(organizations).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error("run `pnpm db:seed` first");
  return id;
};

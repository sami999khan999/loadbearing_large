import "dotenv/config";
import { asc, gt, migrate, type OrganizationId } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";
import { organizations } from "./src/pg/schema/index.js";
import { TenantPartitionSeed } from "./src/pg/seed/index.js";
import { TransactionScope } from "./src/pg/transaction/index.js";

// Paged rather than read whole: this runs before the web app can take a request, and a
// deployment with ten thousand tenants should not hold them all in memory to do it.
const PAGE = 500;

// Direct, never pooled. Migrations run DDL and `0022` sets a role default, and a
// transaction pooler is the wrong place for either.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");

const database = new Database({ url });
await migrate(database.client, { migrationsFolder: "./migrations" });

// `0023` creates the partitioned parents and no children, so until this loop has run
// every tenant-owned table rejects every insert. One implementation creates partitions;
// a SQL copy of it in the migration would be a second one that drifts.
const scope = new TransactionScope();
const partitions = new TenantPartitionSeed(database, scope);

let after: OrganizationId | null = null;
let tenants = 0;
let created = 0;

for (;;) {
  const page = await database.client
    .select({ id: organizations.id })
    .from(organizations)
    .where(after ? gt(organizations.id, after) : undefined)
    .orderBy(asc(organizations.id))
    .limit(PAGE);

  if (page.length === 0) break;

  // One transaction per tenant, not one for the page: a tenant's seven partitions are
  // useful on their own, and a long DDL transaction holds locks the whole time.
  for (const { id } of page) {
    await database.client.transaction(async (tx) =>
      scope.within(tx, async () => {
        created += (await partitions.run(id)).length;
      }),
    );
    tenants += 1;
  }

  after = page[page.length - 1]?.id ?? null;
  if (page.length < PAGE) break;
}

await database.close();

console.log(`migrations applied; ${created} partitions ensured across ${tenants} tenants`);

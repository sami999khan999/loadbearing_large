import { Identifiers, type OrganizationId, type UserId } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { organizations, users } from "../../src/pg/schema/index.js";
import { TenantPartitionSeed } from "../../src/pg/seed/index.js";
import { PgUnitOfWork, ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();

let database: Database;
let gateway: PgMaintenanceGateway;
let seed: TenantPartitionSeed;
let author: UserId;

const founded: OrganizationId[] = [];

const tenant = async (): Promise<OrganizationId> => {
  const organizationId = Identifiers.organizationId.parse(Uuid.v7());
  await database.client
    .insert(organizations)
    .values({ id: organizationId, slug: `orphan-${organizationId}`, name: "Orphan" });
  await seed.run(organizationId);
  founded.push(organizationId);
  return organizationId;
};

beforeAll(async () => {
  database = openDatabase();
  const scope = new TransactionScope();
  const cluster = DatabaseCluster.single(database);

  seed = new TenantPartitionSeed(cluster, scope, shards);
  gateway = new PgMaintenanceGateway(
    cluster,
    scope,
    shards,
    new PgUnitOfWork(cluster, scope, shards, "catalog"),
  );

  author = Identifiers.userId.parse(Uuid.v7());
  await database.client
    .insert(users)
    .values({ id: author, name: "Ada", email: `${author}@example.test`, emailVerified: true });
});

afterAll(async () => {
  for (const organizationId of founded) {
    await gateway.dropTenantPartitions(organizationId);
    await database.client.delete(organizations).where(eq(organizations.id, organizationId));
  }

  await database.client.delete(users).where(eq(users.id, author));
  await database.close();
});

// `24.1` dropped the ten keys that made a leaked row impossible, so this read is the
// guarantee that replaced them. It runs nightly and its silence is the healthy answer.
describe("PgMaintenanceGateway.orphanedTenants", () => {
  // The whole point: a tenant with partitions and a live `organizations` row is not an
  // orphan, however many other tenants the node holds.
  it("does not name a tenant whose organization row is there", async () => {
    const live = await tenant();

    expect(await gateway.orphanedTenants()).not.toContain(live);
  });

  // The failure it exists to find: partitions left behind by a delete that did not
  // finish. Before `24.1` the database refused to let this happen at all.
  it("names a tenant whose partitions outlived its organization row", async () => {
    const abandoned = await tenant();
    await database.client.delete(organizations).where(eq(organizations.id, abandoned));

    expect(await gateway.orphanedTenants()).toContain(abandoned);

    // Put it back, so the shared teardown can drop the partitions the normal way.
    await database.client
      .insert(organizations)
      .values({ id: abandoned, slug: `orphan-${abandoned}`, name: "Orphan" });
  });

  // The id is rebuilt from the partition suffix, which carries no dashes. A reader that
  // compared the hex against `organizations.id` would find nothing and call it an orphan.
  it("reports an id the catalog can be queried with", async () => {
    const abandoned = await tenant();
    await database.client.delete(organizations).where(eq(organizations.id, abandoned));

    const orphans = await gateway.orphanedTenants();
    const found = orphans.find((id) => id === abandoned);

    expect(found, `${abandoned} not among ${orphans.length} orphans`).toBeDefined();
    expect(found).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);

    await database.client
      .insert(organizations)
      .values({ id: abandoned, slug: `orphan-${abandoned}`, name: "Orphan" });
  });
});

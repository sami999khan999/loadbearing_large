import { PartitionedTable } from "@loadbearing/application";
import {
  type ConversationId,
  Identifiers,
  type MessageId,
  type OrganizationId,
  type UserId,
} from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import {
  conversationMembers,
  conversations,
  messages,
  organizations,
  users,
} from "../../src/pg/schema/index.js";
import { TenantPartitionSeed } from "../../src/pg/seed/index.js";
import { PgUnitOfWork, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

let database: Database;
let gateway: PgMaintenanceGateway;
let seed: TenantPartitionSeed;
let author: UserId;

// The two composite foreign keys `0023` introduced. They are constraints on the *parent*
// tables, so there is exactly one row each however many partitions exist under them.
const PARENT_KEYS = ["conversation_members_conversation_fk", "messages_conversation_fk"];

const tenant = async (): Promise<OrganizationId> => {
  const organizationId = Identifiers.organizationId.parse(Uuid.v7());
  await database.client
    .insert(organizations)
    .values({ id: organizationId, slug: `drop-${organizationId}`, name: "Drop" });
  await seed.run(organizationId);
  return organizationId;
};

// Rows in the referencing tables, because an empty tenant cannot show the failure: what
// Postgres refuses is detaching a partition something still points into.
const populate = async (organizationId: OrganizationId): Promise<void> => {
  const conversationId = Identifiers.conversationId.parse(Uuid.v7());

  await database.client
    .insert(conversations)
    .values({ id: conversationId, organizationId, kind: "channel", createdBy: author });
  await database.client
    .insert(conversationMembers)
    .values({ id: Uuid.v7(), organizationId, conversationId, userId: author, role: "owner" });
  await database.client.insert(messages).values({
    id: Uuid.v7() as MessageId,
    organizationId,
    conversationId,
    authorId: author,
    clientId: Uuid.v7(),
    body: "hello",
  });
};

// Inlined rather than bound: drizzle sends a JS array as a record, and `= any($1)` then
// fails with "requires array on right side". Every value here is a constant in this file.
const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

// Read from the catalog rather than counted: a constraint whose parent row is gone is
// gone for every tenant at once, which is the whole point of this file.
const parentForeignKeys = async (): Promise<readonly string[]> => {
  const rows = await database.client.execute<{ conname: string }>(sql`
    select conname
    from pg_constraint
    where contype = 'f'
      and conrelid in ('conversation_members'::regclass, 'messages'::regclass)
      and conname in (${quoted(PARENT_KEYS)})
    order by conname
  `);

  return rows.rows.map((row) => row.conname);
};

const partitionsOf = async (organizationId: OrganizationId): Promise<readonly string[]> => {
  const names = PartitionedTable.TENANT_PARTITIONED.map((entry) =>
    TenantPartitionSeed.partitionName(entry.name, organizationId),
  );

  const rows = await database.client.execute<{ name: string }>(sql`
    select relname as name from pg_class where relname in (${quoted(names)}) order by relname
  `);

  return rows.rows.map((row) => row.name);
};

beforeAll(async () => {
  database = openDatabase();
  const scope = new TransactionScope();
  gateway = new PgMaintenanceGateway(database, scope, new PgUnitOfWork(database, scope));
  seed = new TenantPartitionSeed(database, scope);

  author = Identifiers.userId.parse(Uuid.v7());
  await database.client
    .insert(users)
    .values({ id: author, name: "Dropper", email: `${author}@example.test` });
});

afterAll(async () => {
  await database.client.delete(users).where(eq(users.id, author));
  await database.close();
});

describe("TenantPartitionSeed", () => {
  it("creates every tenant partition, and a second run creates nothing", async () => {
    const organizationId = await tenant();

    try {
      expect(await partitionsOf(organizationId)).toHaveLength(
        PartitionedTable.TENANT_PARTITIONED.length,
      );
      // Idempotent, because three callers can run it twice: the founder, the seed script
      // and `migrate.ts` all reach it for an organization that may already have them.
      expect(await seed.run(organizationId)).toEqual([]);
    } finally {
      await gateway.dropTenantPartitions(organizationId);
      await database.client.delete(organizations).where(eq(organizations.id, organizationId));
    }
  });
});

// The exit criterion Phase 16 states in so many words: a row for a tenant with no
// partition fails with the Postgres error, never silently.
describe("a tenant with no partitions", () => {
  it("refuses the write rather than losing it", async () => {
    const organizationId = Identifiers.organizationId.parse(Uuid.v7());
    await database.client
      .insert(organizations)
      .values({ id: organizationId, slug: `bare-${organizationId}`, name: "Bare" });

    try {
      const write = database.client.insert(conversations).values({
        id: Uuid.v7() as ConversationId,
        organizationId,
        kind: "channel",
        createdBy: author,
      });

      // The cause, not the message: drizzle wraps every failure as "Failed query", and
      // asserting on that would pass for a typo as readily as for the missing partition.
      const error = await write.then(
        () => null,
        (thrown: unknown) => thrown as { cause?: { message?: string; code?: string } },
      );

      expect(error?.cause?.code).toBe("23514");
      expect(error?.cause?.message).toMatch(/no partition of relation "conversations" found/i);
    } finally {
      await database.client.delete(organizations).where(eq(organizations.id, organizationId));
    }
  });
});

describe("PgMaintenanceGateway.dropTenantPartitions", () => {
  it("takes the tenant's whole subtree, months included", async () => {
    const organizationId = await tenant();
    await populate(organizationId);

    const dropped = await gateway.dropTenantPartitions(organizationId);

    expect(dropped).toHaveLength(PartitionedTable.TENANT_PARTITIONED.length);
    expect(await partitionsOf(organizationId)).toEqual([]);

    // The month children went with their tenant partition rather than being left behind
    // as detached tables nothing references.
    const orphans = await database.client.execute<{ name: string }>(sql`
      select relname as name from pg_class
      where relname like ${`%_${organizationId.replaceAll("-", "")}_%`}
    `);
    expect(orphans.rows).toEqual([]);

    await database.client.delete(organizations).where(eq(organizations.id, organizationId));
  });

  // The regression this file exists for: `DROP TABLE … CASCADE` on a partition of a
  // referenced table takes the parent's foreign key with it, for every tenant.
  it("leaves the composite foreign keys on the parents alone", async () => {
    expect(await parentForeignKeys()).toEqual(PARENT_KEYS);

    const organizationId = await tenant();
    await populate(organizationId);
    await gateway.dropTenantPartitions(organizationId);
    await database.client.delete(organizations).where(eq(organizations.id, organizationId));

    expect(await parentForeignKeys()).toEqual(PARENT_KEYS);
  });

  it("is a no-op for a tenant whose partitions are already gone", async () => {
    const organizationId = await tenant();
    await gateway.dropTenantPartitions(organizationId);

    expect(await gateway.dropTenantPartitions(organizationId)).toEqual([]);
    await database.client.delete(organizations).where(eq(organizations.id, organizationId));
  });
});

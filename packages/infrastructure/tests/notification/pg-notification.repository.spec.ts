import { PartitionedTable } from "@loadbearing/application";
import { Identifiers, type OrganizationId, type UserId } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { PgNotificationRepository } from "../../src/pg/repository/pg-notification.repository.js";
import { organizations, users } from "../../src/pg/schema/index.js";
import { PgUnitOfWork, ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { dropTenant, openDatabase, seedTenant } from "../support/database.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });

beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

let database: Database;
let repository: PgNotificationRepository;
let organizationId: OrganizationId;
let other: OrganizationId;
let ada: UserId;
let grace: UserId;
let stranger: UserId;

// A day either side of the cutoff the digest uses, so "since" is a fact rather than a
// coin toss against `now()`.
const RECENT = new Date(Date.UTC(2031, 4, 2, 9, 0, 0));
const OLD = new Date(Date.UTC(2031, 3, 2, 9, 0, 0));
const CUTOFF = new Date(Date.UTC(2031, 4, 1, 0, 0, 0));

const makeUser = async (name: string): Promise<UserId> => {
  const id = Identifiers.userId.parse(Uuid.v7());
  await database.client.insert(users).values({ id, name, email: `${id}@example.test` });
  return id;
};

// The seed creates this month and the next two, and these instants are years out — so
// the months this spec writes into are ensured here rather than assumed.
const makeTenant = async (slug: string): Promise<OrganizationId> => {
  const id = Identifiers.organizationId.parse(Uuid.v7());
  await database.client.insert(organizations).values({ id, name: slug, slug: `${slug}-${id}` });
  await seedTenant(database, id);

  const scope = new TransactionScope();
  const cluster = DatabaseCluster.single(database);
  const maintenance = new PgMaintenanceGateway(
    cluster,
    scope,
    shards,
    new PgUnitOfWork(cluster, scope, shards, "catalog"),
  );
  // Two months from the older instant covers both it and the recent one.
  await maintenance.ensureMonthlyPartitions(PartitionedTable.NOTIFICATIONS, id, OLD, 2);
  return id;
};

const notify = (
  tenant: OrganizationId,
  userId: UserId,
  createdAt: Date,
  kind = "message.received" as const,
) =>
  repository.saveMany([
    {
      organizationId: tenant,
      userId,
      eventId: Uuid.v7(),
      kind,
      category: kind === "message.received" ? "messaging" : "membership",
      params: {},
      link: null,
      subjectId: null,
      createdAt,
    },
  ]);

beforeAll(async () => {
  database = openDatabase();
  repository = new PgNotificationRepository(
    DatabaseCluster.single(database),
    new TransactionScope(),
    shards,
  );

  // Two tenants, because the whole point of the cross-tenant read is that it answers
  // for the right ones — a spec with one tenant passes even if the predicate is gone.
  organizationId = await makeTenant("notification-spec");
  other = await makeTenant("notification-other");

  ada = await makeUser("Ada");
  grace = await makeUser("Grace");
  stranger = await makeUser("Stranger");
});

afterAll(async () => {
  for (const tenant of [organizationId, other]) {
    await dropTenant(database, tenant);
    await database.client.delete(organizations).where(eq(organizations.id, tenant));
  }
  for (const id of [ada, grace, stranger]) {
    await database.client.delete(users).where(eq(users.id, id));
  }
  await database.close();
});

// The two reads the digest is built on. Before them the candidate list came from
// `notification_preferences`, which is empty for everyone on the shipped defaults.
describe("PgNotificationRepository.recipientsWithUnreadSince", () => {
  it("finds a reader who has stored no preference at all", async () => {
    await notify(organizationId, ada, RECENT);

    const found = await repository.recipientsWithUnreadSince(organizationId, CUTOFF, 50, null);

    expect(found).toContain(ada);
  });

  it("does not leak a reader from another tenant", async () => {
    await notify(other, stranger, RECENT);

    const found = await repository.recipientsWithUnreadSince(organizationId, CUTOFF, 50, null);

    expect(found).not.toContain(stranger);
  });

  it("ignores rows older than the cutoff", async () => {
    await notify(organizationId, grace, OLD);

    const found = await repository.recipientsWithUnreadSince(organizationId, CUTOFF, 50, null);

    expect(found).not.toContain(grace);
  });

  it("ignores a row that has been read", async () => {
    const reader = await makeUser("Read");
    await notify(organizationId, reader, RECENT);
    await repository.markAllRead(organizationId, reader, new Date());

    const found = await repository.recipientsWithUnreadSince(organizationId, CUTOFF, 50, null);

    expect(found).not.toContain(reader);
    await database.client.delete(users).where(eq(users.id, reader));
  });

  // One row per user, not one per notification: the digest pages over this list, and a
  // reader with forty unread rows would otherwise be mailed forty times.
  it("returns a reader once however many rows they hold", async () => {
    const busy = await makeUser("Busy");
    for (let index = 0; index < 3; index += 1) await notify(organizationId, busy, RECENT);

    const found = await repository.recipientsWithUnreadSince(organizationId, CUTOFF, 50, null);

    expect(found.filter((id) => id === busy)).toHaveLength(1);
    await database.client.delete(users).where(eq(users.id, busy));
  });

  // Keyset on the user id, which is the only stable order this page has.
  it("pages from the cursor without repeating a reader", async () => {
    const first = await repository.recipientsWithUnreadSince(organizationId, CUTOFF, 1, null);
    expect(first).toHaveLength(1);

    const second = await repository.recipientsWithUnreadSince(
      organizationId,
      CUTOFF,
      50,
      first[0] ?? null,
    );

    expect(second).not.toContain(first[0]);
    for (const id of second) expect(id > (first[0] ?? "")).toBe(true);
  });
});

describe("PgNotificationRepository.organizationsWithUnreadSince", () => {
  // The fan-out's question. It used to ask the preference table, so a tenant where
  // nobody had opened the preferences screen was never queued a digest at all.
  it("names a tenant that has unread rows and nothing else", async () => {
    const found = await repository.organizationsWithUnreadSince(CUTOFF);

    expect(found).toContain(organizationId);
    expect(found).toContain(other);
  });

  it("does not name a tenant whose only rows are older than the cutoff", async () => {
    const quiet = await makeTenant("notification-quiet");
    await notify(quiet, ada, OLD);

    const found = await repository.organizationsWithUnreadSince(CUTOFF);

    expect(found).not.toContain(quiet);
    await dropTenant(database, quiet);
    await database.client.delete(organizations).where(eq(organizations.id, quiet));
  });
});

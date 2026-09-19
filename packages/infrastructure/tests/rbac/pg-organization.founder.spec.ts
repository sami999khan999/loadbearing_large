import { Identifiers, type OrganizationId, type UserId } from "@loadbearing/contracts";
import { SystemClock, Uuid } from "@loadbearing/core";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { PgOrganizationFounder } from "../../src/pg/repository/pg-organization.founder.js";
import {
  activityLog,
  memberships,
  organizations,
  roles,
  users,
} from "../../src/pg/schema/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();

let database: Database;
const created: UserId[] = [];

const makeUser = async (name = "Ada") => {
  const id = Identifiers.userId.parse(Uuid.v7());
  await database.client.insert(users).values({
    id,
    name,
    email: `${id}@example.test`,
    emailVerified: true,
  });
  created.push(id);
  return id;
};

// The founder and its logger share one scope on purpose: that is what puts the audit
// row inside the founding transaction, and the last test depends on it.
const founder = (scope = new TransactionScope()) =>
  new PgOrganizationFounder(
    DatabaseCluster.single(database),
    scope,
    shards,
    new PgActivityLogger(DatabaseCluster.single(database), scope, shards, new SystemClock()),
  );

beforeAll(() => {
  database = openDatabase();
});

afterAll(async () => {
  if (created.length > 0) {
    const owned = await database.client
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(inArray(memberships.userId, created));

    await database.client.delete(users).where(inArray(users.id, created));

    for (const row of owned) {
      // The column carries no brand, and `organizations.id` does — parsed rather than
      // cast, so a row that is not a uuid fails here instead of in the driver.
      const organizationId = Identifiers.organizationId.parse(row.organizationId);
      await database.client.delete(roles).where(eq(roles.organizationId, organizationId));
      await database.client.delete(organizations).where(eq(organizations.id, organizationId));
    }
  }
  await database.close();
});

describe("PgOrganizationFounder", () => {
  it("founds an organization the user owns, seeded with the four system roles", async () => {
    const userId = await makeUser();

    const organizationId = await founder().found(userId, "Acme");

    const [membership] = await database.client
      .select({ roleId: memberships.roleId })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)));
    const [role] = await database.client
      .select({ key: roles.key })
      .from(roles)
      .where(eq(roles.id, membership?.roleId ?? ""));
    const seeded = await database.client
      .select({ key: roles.key })
      .from(roles)
      .where(eq(roles.organizationId, organizationId));

    expect(role?.key).toBe("owner");
    expect(seeded.map((r) => r.key).sort()).toEqual(["admin", "guest", "member", "owner"]);
  });

  it("names the row as told and slugs from the organization id unless given one", async () => {
    const userId = await makeUser();

    const defaulted = await founder().found(userId, "Acme");
    const explicit = await founder().found(userId, "Personal", `u-${userId}`);

    const rows = await database.client
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(inArray(organizations.id, [defaulted, explicit]));

    expect(rows.find((r) => r.id === defaulted)).toEqual({
      id: defaulted,
      name: "Acme",
      slug: `o-${defaulted}`,
    });
    expect(rows.find((r) => r.id === explicit)?.slug).toBe(`u-${userId}`);
  });

  // The audit row is written as the *new* tenant, which is the only tenant the fact
  // belongs to — the founder may well be acting from a session in another one.
  it("records organization.created in the new tenant's audit log", async () => {
    const userId = await makeUser();

    const organizationId = await founder().found(userId, "Audited");

    const rows = await database.client
      .select({ actorId: activityLog.actorId, payload: activityLog.payload })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.organizationId, organizationId),
          eq(activityLog.action, "organization.created"),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(userId);
    expect(rows[0]?.payload).toEqual({ name: "Audited" });
  });

  // What lets the personal enroller call this inside its own locked transaction: the
  // founding becomes a savepoint, and an abort above it takes the tenant with it.
  it("becomes a savepoint inside an enclosing transaction and rolls back with it", async () => {
    const userId = await makeUser();
    const scope = new TransactionScope();
    const subject = founder(scope);
    let organizationId: OrganizationId | undefined;

    await expect(
      database.client.transaction(async (tx) =>
        scope.within(tx, "catalog", async () => {
          organizationId = await subject.found(userId, "Doomed");
          throw new Error("abort");
        }),
      ),
    ).rejects.toThrow("abort");

    // Thrown rather than asserted: the query below needs the id, and "the founder
    // returned nothing" is a different failure from "the row survived the rollback".
    if (organizationId === undefined) throw new Error("found returned no organization");

    const rows = await database.client
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    expect(rows).toHaveLength(0);
  });
});

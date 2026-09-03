import { Identifiers } from "@loadbearing/contracts";
import { SystemClock, Uuid } from "@loadbearing/core";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { PgOrganizationFounder } from "../../src/pg/repository/pg-organization.founder.js";
import { PgPersonalOrganizationEnroller } from "../../src/pg/repository/pg-personal-organization.enroller.js";
import { memberships, organizations, roles, users } from "../../src/pg/schema/index.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

let database: Database;

// Unlike the other specs here, this one must create rows: the whole behaviour under
// test is what happens to a user who has no membership yet, and the seeded organization
// has one by definition. Everything created is torn down at the end.
const created: string[] = [];

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

beforeAll(() => {
  database = openDatabase();
});

afterAll(async () => {
  // Memberships and roles cascade from the organization; users cascade their own
  // memberships. Ordering matters only for the organizations, which are found through
  // the memberships that are about to be deleted.
  if (created.length > 0) {
    const owned = await database.client
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(inArray(memberships.userId, created));

    await database.client.delete(users).where(inArray(users.id, created));

    for (const row of owned) {
      await database.client.delete(roles).where(eq(roles.organizationId, row.organizationId));
      await database.client.delete(organizations).where(eq(organizations.id, row.organizationId));
    }
  }
  await database.close();
});

describe("PgPersonalOrganizationEnroller", () => {
  // One scope shared by the enroller and the founder it delegates to — the founder's
  // savepoint has to open inside the enroller's locked transaction, not on the pool.
  const enroller = () => {
    const scope = new TransactionScope();
    const activity = new PgActivityLogger(database, scope, new SystemClock());
    return new PgPersonalOrganizationEnroller(
      database,
      scope,
      new PgOrganizationFounder(database, scope, activity),
    );
  };

  // The whole `personal` mode in one assertion: an account with nothing behind it ends
  // up owning a tenant with the same four system roles `pnpm db:seed` would have made.
  it("gives a new user an organization of their own, as its owner", async () => {
    const userId = await makeUser();

    const organizationId = await enroller().enrol(userId);
    expect(organizationId).not.toBeNull();

    const [membership] = await database.client
      .select({ roleId: memberships.roleId })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    const [role] = await database.client
      .select({ key: roles.key })
      .from(roles)
      .where(eq(roles.id, membership?.roleId ?? ""));

    expect(role?.key).toBe("owner");
  });

  // `SystemRoleSeed` is reused rather than reimplemented, and this is what proves it:
  // an organization created at sign-in has to be indistinguishable from a seeded one,
  // or the second tenant in the system has a different permission model from the first.
  it("seeds every system role into the organization it creates", async () => {
    const userId = await makeUser();
    const organizationId = await enroller().enrol(userId);

    const seeded = await database.client
      .select({ key: roles.key })
      .from(roles)
      .where(eq(roles.organizationId, organizationId ?? ""));

    expect(seeded.map((role) => role.key).sort()).toEqual(["admin", "guest", "member", "owner"]);
  });

  // The idempotency the advisory lock exists for. Better Auth retries a failed session
  // create, and a second organization per retry would be a tenant nobody can reach and
  // a membership row that decides which one the user actually gets.
  it("returns the same organization on a second call rather than making another", async () => {
    const userId = await makeUser();

    const first = await enroller().enrol(userId);
    const second = await enroller().enrol(userId);

    expect(second).toBe(first);

    const rows = await database.client
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    expect(rows).toHaveLength(1);
  });

  // Two sign-ins racing on one brand-new user. Losing this race means two organizations
  // and two owner memberships for one person, with the session hook free to pick either
  // — and `owner` is the wildcard role, so the cost of getting it wrong is not cosmetic.
  it("serialises concurrent enrolments into exactly one organization", async () => {
    const userId = await makeUser();

    const results = await Promise.all([
      enroller().enrol(userId),
      enroller().enrol(userId),
      enroller().enrol(userId),
    ]);

    expect(new Set(results).size).toBe(1);

    const rows = await database.client
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    expect(rows).toHaveLength(1);
  });

  // The tenant is named after the person, so this package writes no English and needs
  // no locale to name an organization.
  it("names the organization after the user", async () => {
    const userId = await makeUser("Grace Hopper");
    const organizationId = await enroller().enrol(userId);

    const [organization] = await database.client
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, organizationId ?? ""));

    expect(organization?.name).toBe("Grace Hopper");
    // Derived from the id rather than the name: a slug built from user input needs a
    // collision strategy and a normalisation pass, and `organizations_slug_uq` would
    // turn the second "Grace Hopper" into a failed sign-in.
    expect(organization?.slug).toBe(`u-${userId}`);
  });

  // Declining beats throwing: the caller turns a null into a refused session, which is
  // the safe failure. A user row that does not exist is unreachable from the session
  // hook, and stating that keeps the assumption visible.
  it("declines rather than inventing a tenant for a user that does not exist", async () => {
    const absent = Identifiers.userId.parse(Uuid.v7());

    expect(await enroller().enrol(absent)).toBeNull();
  });
});

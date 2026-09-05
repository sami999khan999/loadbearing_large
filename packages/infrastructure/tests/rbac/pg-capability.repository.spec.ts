import { Identifiers } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { eq, inArray, type Logger } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgCapabilityRepository } from "../../src/pg/repository/pg-capability.repository.js";
import { permissionOverrides, users } from "../../src/pg/schema/index.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

class CountingLogger implements Logger {
  public count = 0;
  public logQuery(): void {
    this.count += 1;
  }
}

const counter = new CountingLogger();
let database: Database;

beforeAll(() => {
  database = openDatabase(counter);
});

const created: string[] = [];

afterAll(async () => {
  if (created.length > 0) {
    await database.client.delete(users).where(inArray(users.id, created));
  }
  await database.close();
});

const makeUser = async () => {
  const id = Identifiers.userId.parse(Uuid.v7());
  await database.client
    .insert(users)
    .values({ id, name: "Ada", email: `${id}@example.test`, emailVerified: true });
  created.push(id);
  return id;
};

describe("PgCapabilityRepository", () => {
  // "Three queries" decays silently — someone adds a lookup inside a loop and it
  // becomes 3 + N, invisible at ten users and fatal at five thousand.
  it("resolves capabilities in exactly three queries", async () => {
    const organizationId = await seedOrganizationId(database);
    const repository = new PgCapabilityRepository(database, new TransactionScope());

    // A well-formed uuid that was never seeded: the columns are `uuid`, so
    // "no-such-user" is a 22P02 rather than the empty result being asserted on.
    const absentUser = Identifiers.userId.parse(Uuid.v7());

    counter.count = 0;
    await repository.resolveFor(organizationId, absentUser);

    expect(counter.count).toBe(3);
  });

  // NULLs are distinct in a unique index, so `(user_id, goal_id, permission)` exempted
  // every org-scope row and duplicates accumulated silently.
  it("refuses a duplicate org-scope override", async () => {
    const organizationId = await seedOrganizationId(database);
    const userId = await makeUser();

    const row = {
      organizationId,
      userId,
      goalId: null,
      permission: "rbac.role.read",
      effect: "grant" as const,
    };

    await database.client.insert(permissionOverrides).values({ id: Uuid.v7(), ...row });

    await expect(
      database.client.insert(permissionOverrides).values({ id: Uuid.v7(), ...row }),
    ).rejects.toThrow();

    // Including the contradictory pair, which is the shape that made the accumulation
    // worth catching: `can()` resolves grant-plus-deny to deny either way.
    await expect(
      database.client.insert(permissionOverrides).values({ id: Uuid.v7(), ...row, effect: "deny" }),
    ).rejects.toThrow();

    await database.client.delete(permissionOverrides).where(eq(permissionOverrides.userId, userId));
  });

  it("still admits the same permission at org scope and inside a goal", async () => {
    const organizationId = await seedOrganizationId(database);
    const userId = await makeUser();
    const goalId = Uuid.v7();

    const base = { organizationId, userId, permission: "rbac.role.read", effect: "deny" as const };

    await database.client.insert(permissionOverrides).values([
      { id: Uuid.v7(), ...base, goalId: null },
      { id: Uuid.v7(), ...base, goalId },
    ]);

    const rows = await database.client
      .select()
      .from(permissionOverrides)
      .where(eq(permissionOverrides.userId, userId));

    expect(rows).toHaveLength(2);

    await database.client.delete(permissionOverrides).where(eq(permissionOverrides.userId, userId));
  });
});

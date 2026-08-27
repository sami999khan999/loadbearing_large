import { Identifiers } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import type { Logger } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/primitive/index.js";
import { PgCapabilityRepository } from "../../src/rbac/pg-capability.repository.js";
import { TransactionScope } from "../../src/transaction/index.js";
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

afterAll(async () => {
  await database.close();
});

describe("PgCapabilityRepository", () => {
  // "Three queries" decays silently — someone adds a lookup inside a loop and it
  // becomes 3 + N, invisible at ten users and fatal at five thousand.
  it("resolves capabilities in exactly three queries", async () => {
    const organizationId = await seedOrganizationId(database);
    const repository = new PgCapabilityRepository(database, new TransactionScope());

    // A well-formed uuid that was never seeded, not a readable placeholder — all
    // three columns are `uuid`, so a string like "no-such-user" is a 22P02 from
    // Postgres rather than the empty result the assertion is about.
    const absentUser = Identifiers.userId.parse(Uuid.v7());

    counter.count = 0;
    await repository.resolveFor(organizationId, absentUser);

    expect(counter.count).toBe(3);
  });
});

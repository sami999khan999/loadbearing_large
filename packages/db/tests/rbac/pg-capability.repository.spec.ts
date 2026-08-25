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

    counter.count = 0;
    await repository.resolveFor(organizationId, "no-such-user");

    expect(counter.count).toBe(3);
  });
});

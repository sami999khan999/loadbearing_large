import { Principal } from "@loadbearing/application";
import { Identifiers } from "@loadbearing/contracts";
import { SystemClock, Uuid } from "@loadbearing/core";
import { CapabilitySet } from "@loadbearing/permissions";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgActivityLogger } from "../../src/activity/pg-activity.logger.js";
import type { Database } from "../../src/primitive/index.js";
import { activityLog } from "../../src/schema/index.js";
import { PgUnitOfWork, TransactionScope } from "../../src/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

let database: Database;
let scope: TransactionScope;

beforeAll(() => {
  database = openDatabase();
  scope = new TransactionScope();
});

afterAll(async () => {
  await database.close();
});

const actorFor = async () =>
  new Principal(
    await seedOrganizationId(database),
    Identifiers.userId.parse(Uuid.v7()),
    CapabilitySet.empty(),
  );

const findByAction = (action: string) =>
  database.client
    .select({ action: activityLog.action })
    .from(activityLog)
    .where(eq(activityLog.action, action));

describe("PgUnitOfWork", () => {
  it("rolls back every write in the callback", async () => {
    const actor = await actorFor();
    const uow = new PgUnitOfWork(database, scope);
    const logger = new PgActivityLogger(database, scope, new SystemClock());
    const action = `test.rollback.${Uuid.v7()}`;

    await expect(
      uow.run(async () => {
        await logger.record(actor, action, { probe: true });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await findByAction(action)).toEqual([]);
  });

  // A run() that rolled back on success too would pass the assertion above
  // perfectly, which is why both directions are asserted.
  it("commits when the callback returns", async () => {
    const actor = await actorFor();
    const uow = new PgUnitOfWork(database, scope);
    const logger = new PgActivityLogger(database, scope, new SystemClock());
    const action = `test.commit.${Uuid.v7()}`;

    await uow.run(async () => {
      await logger.record(actor, action, { probe: true });
    });

    expect(await findByAction(action)).toHaveLength(1);
  });
});

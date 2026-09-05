import { Principal } from "@loadbearing/application";
import { Identifiers } from "@loadbearing/contracts";
import { SystemClock, Uuid } from "@loadbearing/core";
import { CapabilitySet } from "@loadbearing/permissions";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { activityLog } from "../../src/pg/schema/index.js";
import { PgUnitOfWork, TransactionScope } from "../../src/pg/transaction/index.js";
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

  // The regression guard for a nested `run()` opening a second connection: the inner unit
  // committed on a connection the outer one could not roll back.
  it("joins the outer transaction rather than opening a second one", async () => {
    const actor = await actorFor();
    const uow = new PgUnitOfWork(database, scope);
    const logger = new PgActivityLogger(database, scope, new SystemClock());
    const outer = `test.outer.${Uuid.v7()}`;
    const inner = `test.inner.${Uuid.v7()}`;

    await expect(
      uow.run(async () => {
        await logger.record(actor, outer, { probe: true });

        await uow.run(async () => {
          await logger.record(actor, inner, { probe: true });
        });

        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Both, or the inner write survived a rollback it was supposed to be part of.
    expect(await findByAction(outer)).toEqual([]);
    expect(await findByAction(inner)).toEqual([]);
  });

  // The savepoint has to be a savepoint rather than a no-op: an inner failure caught by
  // the outer callback rolls back only the inner work.
  it("rolls the inner work back to a savepoint without losing the outer", async () => {
    const actor = await actorFor();
    const uow = new PgUnitOfWork(database, scope);
    const logger = new PgActivityLogger(database, scope, new SystemClock());
    const outer = `test.kept.${Uuid.v7()}`;
    const inner = `test.dropped.${Uuid.v7()}`;

    await uow.run(async () => {
      await logger.record(actor, outer, { probe: true });

      await expect(
        uow.run(async () => {
          await logger.record(actor, inner, { probe: true });
          throw new Error("inner");
        }),
      ).rejects.toThrow("inner");
    });

    expect(await findByAction(outer)).toHaveLength(1);
    expect(await findByAction(inner)).toEqual([]);
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

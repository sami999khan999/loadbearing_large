import { Principal } from "@loadbearing/application";
import { Identifiers } from "@loadbearing/contracts";
import { SystemClock, Uuid } from "@loadbearing/core";
import { CapabilitySet } from "@loadbearing/permissions";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Database, DatabaseCluster, type DrizzleClient } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { activityLog } from "../../src/pg/schema/index.js";
import { PgUnitOfWork, ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { DATABASE_URL, openDatabase, seedOrganizationId } from "../support/database.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();

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
    const uow = new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "catalog");
    const logger = new PgActivityLogger(
      DatabaseCluster.single(database),
      scope,
      shards,
      new SystemClock(),
    );
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
    const uow = new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "catalog");
    const logger = new PgActivityLogger(
      DatabaseCluster.single(database),
      scope,
      shards,
      new SystemClock(),
    );
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
    const uow = new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "catalog");
    const logger = new PgActivityLogger(
      DatabaseCluster.single(database),
      scope,
      shards,
      new SystemClock(),
    );
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
    const uow = new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "catalog");
    const logger = new PgActivityLogger(
      DatabaseCluster.single(database),
      scope,
      shards,
      new SystemClock(),
    );
    const action = `test.commit.${Uuid.v7()}`;

    await uow.run(async () => {
      await logger.record(actor, action, { probe: true });
    });

    expect(await findByAction(action)).toHaveLength(1);
  });

  // Two distinct values, neither of them the 30s default, so a `SET LOCAL` that never ran
  // and one that ran and leaked both fail. See docs/reference/unit-of-work.md.
  it("applies the configured statement timeout inside run and nowhere else", async () => {
    const pooled = new Database({ url: DATABASE_URL, statementTimeoutMs: 25_000 });
    const timeoutScope = new TransactionScope();
    const uow = new PgUnitOfWork(DatabaseCluster.single(pooled), timeoutScope, shards, "catalog", {
      statementTimeoutMs: 90_000,
    });

    const show = async (client: DrizzleClient) =>
      (await client.execute<{ statement_timeout: string }>(sql`show statement_timeout`)).rows[0]
        ?.statement_timeout;

    try {
      expect(await show(pooled.client)).toBe("25s");

      await uow.run(async () => {
        const open = timeoutScope.current();
        if (!open) throw new Error("no transaction in scope");
        expect(await show(open.client)).toBe("90s");
      });

      // The connection went back to the pool with the transaction; a plain `SET` here
      // would have followed it and become every later caller's timeout.
      expect(await show(pooled.client)).toBe("25s");
    } finally {
      await pooled.close();
    }
  });

  // Without the guard this sets the timeout on the savepoint's own `SET LOCAL`, which
  // outlives a rollback to that savepoint and silently raises the outer transaction's.
  it("leaves a nested run to the transaction already open", async () => {
    const pooled = new Database({ url: DATABASE_URL, statementTimeoutMs: 25_000 });
    const timeoutScope = new TransactionScope();
    const uow = new PgUnitOfWork(DatabaseCluster.single(pooled), timeoutScope, shards, "catalog", {
      statementTimeoutMs: 90_000,
    });

    try {
      await uow.run(async () => {
        await uow.run(async () => {
          const open = timeoutScope.current();
          if (!open) throw new Error("no transaction in scope");
          expect(
            (await open.client.execute<{ statement_timeout: string }>(sql`show statement_timeout`))
              .rows[0]?.statement_timeout,
          ).toBe("90s");
        });
      });
    } finally {
      await pooled.close();
    }
  });
});

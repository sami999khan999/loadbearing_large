import { Uuid } from "@loadbearing/core";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { PgActivityReplayReader } from "../../src/pg/repository/pg-activity-replay.reader.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

let database: Database;
let reader: PgActivityReplayReader;
let logger: PgActivityLogger;

// Every row this spec writes shares one instant, which is the whole point: a keyset
// carrying only a timestamp cannot separate them, and the bug it hides — a dropped
// row, or one replayed forever — is invisible against data that happens to be spread
// out. The real system produces this shape whenever two writes land in the same
// millisecond, which at any load at all is constantly.
const INSTANT = new Date("2031-03-01T00:00:00.000Z");

beforeAll(async () => {
  database = openDatabase();
  const scope = new TransactionScope();
  reader = new PgActivityReplayReader(database, scope);
  logger = new PgActivityLogger(database, scope, { now: () => INSTANT });

  // `activity_log` is partitioned by month, and a partitioned table with no partition
  // for a row's date rejects the insert outright. Writing to a future month is what
  // makes this spec's window its own — so it has to create the partition first, which
  // is the same call `partitions-monthly` makes every month.
  await new PgMaintenanceGateway(database, scope).ensureActivityPartitions(INSTANT, 1);
});

afterAll(async () => {
  // Drop the partition rather than delete the rows. The table is append-only and
  // shared with the unit-of-work spec, so a predicate delete risks taking rows another
  // test asserts on — and dropping the partition cannot, by construction.
  await database.client.execute(sql`drop table if exists activity_log_2031_03`);
  await database.close();
});

const write = async (count: number) => {
  const organizationId = await seedOrganizationId(database);
  const actor = { userId: Uuid.v7(), organizationId, kind: "user" as const };

  for (let i = 0; i < count; i++) {
    await logger.record(actor as never, "task.reactivated", { taskId: Uuid.v7() });
  }

  return organizationId;
};

// Only this spec's rows. `since()` reads the whole table by design — a projection is
// cross-tenant — so the assertions filter to the window rather than to a tenant.
const mine = async () =>
  (await reader.since({ lastOccurredAt: null, lastId: null }, 1_000)).filter(
    (record) => record.occurredAt.getTime() === INSTANT.getTime(),
  );

describe("PgActivityReplayReader", () => {
  it("walks rows sharing a timestamp without dropping or repeating one", async () => {
    await write(5);

    const all = await mine();
    expect(all).toHaveLength(5);

    // The projection's loop, at a batch size that forces four round trips.
    const seen: string[] = [];
    let checkpoint = { lastOccurredAt: null as Date | null, lastId: null as string | null };

    for (let i = 0; i < 10; i++) {
      const batch = await reader.since(checkpoint, 2);
      const window = batch.filter((r) => r.occurredAt.getTime() === INSTANT.getTime());
      seen.push(...window.map((r) => r.id));
      if (batch.length === 0) break;

      const last = batch[batch.length - 1];
      if (!last) break;
      checkpoint = { lastOccurredAt: last.occurredAt, lastId: last.id };
    }

    expect(seen).toEqual(all.map((record) => record.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("resumes strictly after the checkpoint", async () => {
    const all = await mine();
    const third = all[2];
    if (!third) throw new Error("expected the previous test to have written five rows");

    const rest = (
      await reader.since({ lastOccurredAt: third.occurredAt, lastId: third.id }, 1_000)
    ).filter((record) => record.occurredAt.getTime() === INSTANT.getTime());

    // Strictly after: the checkpoint row itself must not come back, or every run
    // reprojects it and the reconciliation reports drift the projection caused.
    expect(rest.map((record) => record.id)).toEqual(all.slice(3).map((record) => record.id));
  });

  it("lifts a subject out of the payload and brands the ids", async () => {
    const organizationId = await seedOrganizationId(database);
    const taskId = Uuid.v7();
    const actor = { userId: Uuid.v7(), organizationId, kind: "user" as const };

    await logger.record(actor as never, "task.completed", { taskId });

    const record = (await mine()).find((r) => r.action === "task.completed");
    expect(record?.subjectId).toBe(taskId);
    expect(record?.organizationId).toBe(organizationId);
  });

  it("counts by day in the shape the reconciliation diffs", async () => {
    const to = new Date(INSTANT.getTime() + 24 * 60 * 60 * 1_000);
    const counts = await reader.dailyCounts(INSTANT, to);
    const day = counts.find((count) => count.day === "2031-03-01");

    // Six: five from the first test, one from the third.
    expect(day?.rows).toBe(6);
    // A number, not a string. `count(*)` comes back as text from `pg` without the
    // cast, and a string here makes the reconciliation diff every day forever.
    expect(typeof day?.rows).toBe("number");
  });

  it("returns nothing for a window with no rows", async () => {
    const from = new Date("2031-04-01T00:00:00.000Z");
    const to = new Date("2031-04-02T00:00:00.000Z");
    expect(await reader.dailyCounts(from, to)).toEqual([]);
  });
});

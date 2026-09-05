import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

let database: Database;
let gateway: PgMaintenanceGateway;

// Far enough out that nothing has been here: the spec is about the CREATE path, and a
// month that already has a partition tests the `to_regclass` probe instead.
const FROM = new Date("2032-07-01T00:00:00.000Z");
const NAMES = ["activity_log_2032_07", "activity_log_2032_08"];

beforeAll(() => {
  database = openDatabase();
  gateway = new PgMaintenanceGateway(database, new TransactionScope());
});

afterAll(async () => {
  for (const name of NAMES) {
    await database.client.execute(sql.raw(`drop table if exists ${name}`));
  }
  await database.close();
});

describe("PgMaintenanceGateway.ensureActivityPartitions", () => {
  // The regression guard for the parameterised form, which failed at bind time on every
  // run: Postgres accepts no bind parameters in DDL, and no fake can reach that.
  it("actually creates the partitions it reports", async () => {
    const created = await gateway.ensureActivityPartitions(FROM, 2);
    expect(created).toEqual(NAMES);

    const rows = await database.client.execute<{ relname: string }>(
      sql`select c.relname
          from pg_class c
          join pg_inherits i on i.inhrelid = c.oid
          join pg_class p on p.oid = i.inhparent
          where p.relname = 'activity_log' and c.relname like 'activity_log_2032_%'
          order by c.relname`,
    );

    // Attached, not merely existing: a table created without `PARTITION OF` satisfies
    // `to_regclass` on the next run and is never written to.
    expect(rows.rows.map((row) => row.relname)).toEqual(NAMES);
  });

  it("is idempotent, so a second run creates nothing", async () => {
    // The schedule registers on every boot and runs monthly; a second call has to be
    // a no-op rather than an error, or a redeploy turns into a failed job.
    expect(await gateway.ensureActivityPartitions(FROM, 2)).toEqual([]);
  });
});

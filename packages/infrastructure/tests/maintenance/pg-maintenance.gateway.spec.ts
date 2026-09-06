import { Identifiers, type OrganizationId, type UserId } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { sessions, users, verifications } from "../../src/pg/schema/index.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

let database: Database;
let gateway: PgMaintenanceGateway;
let organizationId: OrganizationId;
let sweeper: UserId;

const identifiers: string[] = [];

// Far enough out that nothing has been here: the spec is about the CREATE path, and a
// month that already has a partition tests the `to_regclass` probe instead.
const FROM = new Date("2032-07-01T00:00:00.000Z");
const NAMES = ["activity_log_2032_07", "activity_log_2032_08"];

beforeAll(async () => {
  database = openDatabase();
  gateway = new PgMaintenanceGateway(database, new TransactionScope());

  organizationId = await seedOrganizationId(database);
  sweeper = Identifiers.userId.parse(Uuid.v7());
  await database.client
    .insert(users)
    .values({ id: sweeper, name: "Sweeper", email: `${sweeper}@example.test` });
});

afterAll(async () => {
  for (const name of NAMES) {
    await database.client.execute(sql.raw(`drop table if exists ${name}`));
  }

  // The live rows the sweep was supposed to leave behind. Sessions cascade off the user.
  await database.client.delete(verifications).where(inArray(verifications.identifier, identifiers));
  await database.client.delete(users).where(inArray(users.id, [sweeper]));
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

// The gateway's own rows, so a run leaves the scratch database as it found it.
const session = (expiresAt: Date) => ({
  id: Uuid.v7(),
  token: Uuid.v7(),
  userId: sweeper,
  activeOrganizationId: organizationId,
  surface: "web" as const,
  expiresAt,
});

const verification = (expiresAt: Date) => {
  const identifier = `sweep-${Uuid.v7()}`;
  identifiers.push(identifier);
  return { id: Uuid.v7(), identifier, value: "v", expiresAt };
};

describe("PgMaintenanceGateway.sweepExpired", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const expired = new Date("2029-12-31T23:59:59.000Z");
  const live = new Date("2030-01-01T00:00:01.000Z");

  it("counts the rows it deleted, not the rows it read back", async () => {
    // Cleared first: the count is exact only against a table holding no expired row this
    // spec did not write, and the scratch database is shared with every other spec here.
    await gateway.sweepExpired(now);

    await database.client.insert(sessions).values([session(expired), session(expired)]);
    await database.client.insert(sessions).values(session(live));
    await database.client.insert(verifications).values(verification(expired));
    await database.client.insert(verifications).values([verification(live), verification(live)]);

    // The regression: this used `.returning({ id })` and counted the array, shipping every
    // expired row back over the wire to be measured and thrown away.
    expect(await gateway.sweepExpired(now)).toEqual({ sessions: 2, verifications: 1 });
  });

  it("leaves the unexpired rows alone, and reports zero on a second pass", async () => {
    expect(await gateway.sweepExpired(now)).toEqual({ sessions: 0, verifications: 0 });

    const remaining = await database.client
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.userId, [sweeper]));

    expect(remaining).toHaveLength(1);
  });
});

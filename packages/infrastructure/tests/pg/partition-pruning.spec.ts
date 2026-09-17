import { PartitionedTable, type PartitionedTableName } from "@loadbearing/application";
import {
  Identifiers,
  type NotificationId,
  type OrganizationId,
  type UserId,
} from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { and, asc, eq, type Logger, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { KeysetCursor } from "../../src/pg/primitive/index.js";
import { PgActivityReplayReader } from "../../src/pg/repository/pg-activity-replay.reader.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { PgNotificationRepository } from "../../src/pg/repository/pg-notification.repository.js";
import { PgOutboxGateway } from "../../src/pg/repository/pg-outbox.gateway.js";
import { activityLog, notifications, outboxEvent, users } from "../../src/pg/schema/index.js";
import { PgUnitOfWork, TransactionScope } from "../../src/pg/transaction/index.js";
import { DATABASE_URL, openDatabase, seedOrganizationId } from "../support/database.js";

// The ruler every retention change after this one is measured with: a predicate that
// stops naming the partition column is a plan nobody reads until production is slow.

// Captures every statement as drizzle issues it, so the EXPLAIN below plans the query
// under test rather than a hand-written copy of it that drifts.
class RecordingLogger implements Logger {
  public readonly statements: { query: string; params: unknown[] }[] = [];

  public logQuery(query: string, params: unknown[]): void {
    this.statements.push({ query, params });
  }
}

const recorder = new RecordingLogger();

let database: Database;
let explain: Pool;
let inbox: PgNotificationRepository;
let replay: PgActivityReplayReader;
let outbox: PgOutboxGateway;
let organizationId: OrganizationId;
let reader: UserId;
let written: { id: NotificationId; createdAt: Date };

// Two months far enough out that no migration and no other spec owns them, so this file
// creates every partition it reads and drops every one it created.
const FIRST = new Date("2032-05-01T00:00:00.000Z");
const SECOND = new Date("2032-06-01T00:00:00.000Z");
const MONTHS = ["2032_05", "2032_06"];

const notification = (createdAt: Date) => ({
  organizationId,
  userId: reader,
  eventId: Uuid.v7(),
  kind: "message.received" as const,
  category: "messaging" as const,
  params: {},
  link: null,
  subjectId: null,
  createdAt,
});

beforeAll(async () => {
  database = openDatabase(recorder);
  explain = new Pool({ connectionString: DATABASE_URL });

  const scope = new TransactionScope();
  const unitOfWork = new PgUnitOfWork(database, scope);
  inbox = new PgNotificationRepository(database, scope);
  replay = new PgActivityReplayReader(database, scope);
  outbox = new PgOutboxGateway(database, scope, unitOfWork);

  const maintenance = new PgMaintenanceGateway(database, scope, unitOfWork);
  for (const table of PartitionedTable.NAMES) {
    await maintenance.ensureMonthlyPartitions(table, FIRST, 2);
  }

  organizationId = await seedOrganizationId(database);
  reader = Identifiers.userId.parse(Uuid.v7());
  await database.client
    .insert(users)
    .values({ id: reader, name: "Pruning", email: `${reader}@example.test` });

  await inbox.saveMany([notification(FIRST), notification(SECOND)]);

  for (const at of [FIRST, SECOND]) {
    await database.client.insert(activityLog).values({
      id: Uuid.v7(),
      organizationId,
      actorId: reader,
      action: "task.reactivated",
      payload: {},
      occurredAt: at,
    });

    await database.client.insert(outboxEvent).values({
      id: Uuid.v7(),
      organizationId,
      actorId: reader,
      name: "task.reactivated",
      payload: {},
      occurredAt: at,
      // Written already drained, so the claim this spec plans can never take one of
      // these rows and no other spec's view of the queue moves underneath it.
      publishedAt: at,
    });
  }

  const [row] = await database.client
    .select({ id: notifications.id, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.organizationId, organizationId), eq(notifications.userId, reader)))
    .orderBy(asc(notifications.createdAt))
    .limit(1);

  if (!row) throw new Error("expected the two notifications above to have been written");
  written = { id: row.id as NotificationId, createdAt: row.createdAt };
});

afterAll(async () => {
  // Dropping the partitions takes this spec's rows with them, which is what leaves the
  // user below deletable without a cascade reaching anything it did not write.
  for (const table of PartitionedTable.NAMES) {
    for (const month of MONTHS) {
      await database.client.execute(sql.raw(`drop table if exists ${table}_${month}`));
    }
  }

  await database.client.delete(users).where(eq(users.id, reader));
  await explain.end();
  await database.close();
});

// The statement the method issued, picked out of the handful a unit of work wraps
// around it. Never a copy written beside the repository, which is the thing that drifts.
const capture = async (
  run: () => Promise<unknown>,
  match: RegExp,
): Promise<{ query: string; params: unknown[] }> => {
  recorder.statements.length = 0;
  await run();

  const statement = recorder.statements.find(({ query }) => match.test(query));
  if (!statement) throw new Error(`no statement matching ${match} was issued`);
  return statement;
};

// Read from the catalog every time: other specs create and drop months of their own, and
// a list captured once is one this file would go on asserting against after it moved.
const partitionsOf = async (table: PartitionedTableName): Promise<readonly string[]> => {
  const rows = await database.client.execute<{ name: string }>(sql`
    select child.relname as name
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    where parent.relname = ${table}
    order by child.relname
  `);

  return rows.rows.map((row) => row.name);
};

const relationsIn = (node: unknown, into: Set<string>): void => {
  if (typeof node !== "object" || node === null) return;

  const plan = node as Record<string, unknown>;
  const name = plan["Relation Name"];
  if (typeof name === "string") into.add(name);

  // Both keys: the top of an `EXPLAIN (FORMAT JSON)` document is `{ "Plan": … }` and
  // every node below it carries its children under `"Plans"`.
  relationsIn(plan.Plan, into);

  const children = plan.Plans;
  if (Array.isArray(children)) for (const child of children) relationsIn(child, into);
};

// `EXPLAIN` and never `EXPLAIN ANALYZE`: nothing executes, which is what makes planning
// an UPDATE and a `FOR UPDATE SKIP LOCKED` against live rows safe.
const scannedPartitions = async (
  statement: { query: string; params: unknown[] },
  table: PartitionedTableName,
): Promise<readonly string[]> => {
  const explained = await explain.query(
    `explain (format json) ${statement.query}`,
    statement.params,
  );

  const root: unknown = explained.rows[0]?.["QUERY PLAN"];
  const plans: unknown = typeof root === "string" ? JSON.parse(root) : root;

  const relations = new Set<string>();
  if (Array.isArray(plans)) for (const entry of plans) relationsIn(entry, relations);

  // Intersected with the catalog rather than matched by name shape, so the parent a
  // ModifyTable node names is never counted as a partition that was scanned.
  return (await partitionsOf(table)).filter((name) => relations.has(name));
};

// `<table>_<yyyy>_<mm>` as a month index, null for a child this file did not name — the
// floor assertions leave those alone rather than guess which month they hold.
const monthOf = (table: PartitionedTableName, name: string): number | null => {
  const match = new RegExp(`^${table}_(\\d{4})_(\\d{2})$`).exec(name);
  if (!match?.[1] || !match[2]) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
};

const monthIndex = (at: Date): number => at.getUTCFullYear() * 12 + at.getUTCMonth();

describe("exactly one partition, for the reads carrying an equality or a closed range", () => {
  it("markRead plans against the one month its createdAt names", async () => {
    const statement = await capture(
      () => inbox.markRead(organizationId, reader, written.id, written.createdAt, new Date()),
      /update "notifications"/i,
    );

    expect(await scannedPartitions(statement, PartitionedTable.NOTIFICATIONS)).toEqual([
      "notifications_2032_05",
    ]);
  });

  it("the activity rollup plans against the one month its range falls inside", async () => {
    const statement = await capture(
      () => replay.dailyCounts(FIRST, new Date("2032-05-02T00:00:00.000Z")),
      /from "activity_log"/i,
    );

    expect(await scannedPartitions(statement, PartitionedTable.ACTIVITY_LOG)).toEqual([
      "activity_log_2032_05",
    ]);
  });
});

// A floor cannot prune a *future* month — rows could legitimately land in one — so this
// is the strongest honest assertion: nothing older than the floor is in the plan.
const olderThan = (table: PartitionedTableName, scanned: readonly string[], floor: Date) =>
  scanned.filter((name) => {
    const month = monthOf(table, name);
    return month !== null && month < monthIndex(floor);
  });

describe("the retention tail is pruned, for the reads that carry a floor", () => {
  it("listUnreadSince leaves out every month before its floor", async () => {
    const statement = await capture(
      () => inbox.listUnreadSince(organizationId, reader, SECOND, 50),
      /from "notifications"/i,
    );

    const scanned = await scannedPartitions(statement, PartitionedTable.NOTIFICATIONS);
    expect(olderThan(PartitionedTable.NOTIFICATIONS, scanned, SECOND)).toEqual([]);
    // And not vacuously: the floor's own month is still there to be read.
    expect(scanned).toContain("notifications_2032_06");
  });

  it("the projection walk leaves out every month before its checkpoint", async () => {
    const statement = await capture(
      () =>
        replay.since(
          { lastOccurredAt: SECOND, lastId: "00000000-0000-0000-0000-000000000000" },
          100,
        ),
      /from "activity_log"/i,
    );

    const scanned = await scannedPartitions(statement, PartitionedTable.ACTIVITY_LOG);
    expect(olderThan(PartitionedTable.ACTIVITY_LOG, scanned, SECOND)).toEqual([]);
    expect(scanned).toContain("activity_log_2032_06");
  });
});

// Today's behaviour, asserted on purpose. A row-constructor cursor is not decomposed by
// the pruner, so these read every month there is — see docs/reference/partitions.md.
describe("pinned at every partition, for the reads that carry no bound", () => {
  const pinned = async (
    statement: { query: string; params: unknown[] },
    table: PartitionedTableName,
  ) => {
    expect(await scannedPartitions(statement, table)).toEqual(await partitionsOf(table));
  };

  it("the inbox page reads every month, cursor or no cursor", async () => {
    const first = await capture(
      () => inbox.list(organizationId, reader, { limit: 20, unreadOnly: false }),
      /from "notifications"/i,
    );
    await pinned(first, PartitionedTable.NOTIFICATIONS);

    const next = await capture(
      () =>
        inbox.list(organizationId, reader, {
          limit: 20,
          unreadOnly: false,
          cursor: KeysetCursor.encode(SECOND, written.id),
        }),
      /from "notifications"/i,
    );

    // The cursor did not narrow the *newer* months either, which is the finding this
    // assertion exists to keep from being reversed without the numbers re-measured.
    await pinned(next, PartitionedTable.NOTIFICATIONS);
  });

  it("the bell count reads every month", async () => {
    const statement = await capture(
      () => inbox.countUnread(organizationId, reader, 99),
      /from notifications/i,
    );

    await pinned(statement, PartitionedTable.NOTIFICATIONS);
  });

  it("the suppression check reads every month", async () => {
    const statement = await capture(
      () => inbox.existsUnread(organizationId, reader, "message.received", Uuid.v7()),
      /from "notifications"/i,
    );

    await pinned(statement, PartitionedTable.NOTIFICATIONS);
  });

  it("mark-all-read writes across every month", async () => {
    const statement = await capture(
      () => inbox.markAllRead(organizationId, reader, new Date()),
      /update "notifications"/i,
    );

    await pinned(statement, PartitionedTable.NOTIFICATIONS);
  });

  it("the outbox drain claims across every month", async () => {
    const rolled = new Error("the drain is planned here, never committed");

    const statement = await capture(
      () =>
        outbox
          .drain(10, () => Promise.reject(rolled))
          .catch((error: unknown) => {
            if (error !== rolled) throw error;
          }),
      /skip locked/i,
    );

    await pinned(statement, PartitionedTable.OUTBOX_EVENT);
  });
});

import type { Readable } from "node:stream";
import { Uuid } from "@loadbearing/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { StorageGateway, StoredObject } from "../../src/import.js";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { PgActivityArchiveGateway } from "../../src/pg/repository/pg-activity-archive.gateway.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/pg-maintenance.gateway.js";
import { activityArchive } from "../../src/pg/schema/index.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

// Its own month, so the partition this spec detaches and drops is never one another
// spec is reading.
const PERIOD = new Date("2032-05-01T00:00:00.000Z");
const PARTITION = "activity_log_2032_05";
const ISO = "2032-05-01";

let database: Database;
let scope: TransactionScope;
let logger: PgActivityLogger;

// Collects the stream so the bytes can be counted, and fails on demand — the two
// failures worth pinning both happen after the detach.
class FakeStorage implements Partial<StorageGateway> {
  public failOnPut = false;
  public present = true;
  public uploaded = 0;
  public body: Readable | undefined;

  public async putStream(key: string, body: AsyncIterable<Uint8Array>): Promise<StoredObject> {
    this.body = body as Readable;
    if (this.failOnPut) throw new Error("s3 is down");

    let bytes = 0;
    for await (const chunk of body) bytes += chunk.byteLength;
    this.uploaded = bytes;

    return { key, checksum: `sha-${bytes}`, size: bytes, contentType: "application/x-ndjson" };
  }

  public exists(): Promise<boolean> {
    return Promise.resolve(this.present);
  }
}

const gateway = (storage: FakeStorage) =>
  new PgActivityArchiveGateway(database, scope, storage as unknown as StorageGateway);

const partitionExists = async () => {
  const result = await database.client.execute<{ present: boolean }>(
    sql`select to_regclass(${PARTITION}) is not null as present`,
  );
  return result.rows[0]?.present === true;
};

const isAttached = async () => {
  const result = await database.client.execute<{ attached: boolean }>(
    sql`select exists (
      select 1 from pg_inherits
      where inhrelid = to_regclass(${PARTITION}) and inhparent = to_regclass('activity_log')
    ) as attached`,
  );
  return result.rows[0]?.attached === true;
};

const write = async (count: number) => {
  const organizationId = await seedOrganizationId(database);
  const actor = { userId: Uuid.v7(), organizationId, kind: "user" as const };
  for (let i = 0; i < count; i++) {
    await logger.record(actor as never, "task.reactivated", { taskId: Uuid.v7() });
  }
};

const freshPartition = async () => {
  await database.client.execute(sql`drop table if exists ${sql.identifier(PARTITION)}`);
  await new PgMaintenanceGateway(database, scope).ensureActivityPartitions(PERIOD, 1);
};

beforeAll(() => {
  database = openDatabase();
  scope = new TransactionScope();
  logger = new PgActivityLogger(database, scope, { now: () => PERIOD });
});

afterEach(async () => {
  await database.client.delete(activityArchive).where(eq(activityArchive.period, ISO));
  await database.client.execute(sql`drop table if exists ${sql.identifier(PARTITION)}`);
});

afterAll(async () => {
  await database.close();
});

describe("PgActivityArchiveGateway", () => {
  it("detaches, uploads, records and drops", async () => {
    await freshPartition();
    await write(3);

    const storage = new FakeStorage();
    const result = await gateway(storage).archive(PERIOD);

    // The count is taken after the detach, so it describes exactly the closed set that
    // was uploaded. Counted before, a row written in between is streamed and uncounted.
    expect(storage.uploaded).toBeGreaterThan(0);
    expect(result.rowCount).toBe(3);
    expect(result.period).toBe(ISO);
    expect(await partitionExists()).toBe(false);

    const [recorded] = await database.client
      .select()
      .from(activityArchive)
      .where(eq(activityArchive.period, ISO));

    expect(recorded?.rowCount).toBe(3);
  });

  // The regression guard for a failure between detach and drop. The partition was left
  // detached — invisible to every query against `activity_log`, and nothing put it back.
  it("re-attaches the partition when the upload fails", async () => {
    await freshPartition();
    await write(2);

    const storage = new FakeStorage();
    storage.failOnPut = true;

    await expect(gateway(storage).archive(PERIOD)).rejects.toThrow("s3 is down");

    expect(await partitionExists()).toBe(true);
    expect(await isAttached()).toBe(true);

    // The regression guard within the guard: the stream was left pulling pages out of a
    // partition nobody was uploading, until `afterEach` dropped it under the query.
    expect(storage.body?.destroyed).toBe(true);
  });

  it("re-attaches when the uploaded object cannot be verified", async () => {
    await freshPartition();
    await write(2);

    const storage = new FakeStorage();
    storage.present = false;

    await expect(gateway(storage).archive(PERIOD)).rejects.toThrow("Archive object missing");

    expect(await isAttached()).toBe(true);

    // And nothing was left claiming the archive succeeded.
    const rows = await database.client
      .select()
      .from(activityArchive)
      .where(eq(activityArchive.period, ISO));

    expect(rows).toHaveLength(1);
  });
});

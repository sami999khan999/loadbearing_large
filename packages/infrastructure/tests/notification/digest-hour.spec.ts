import { Uuid } from "@loadbearing/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import {
  PgNotificationSettingsRepository,
  PgOrganizationReader,
} from "../../src/pg/repository/index.js";
import { notificationSettings } from "../../src/pg/schema/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

let database: Database;
let settings: PgNotificationSettingsRepository;
let organizations: PgOrganizationReader;

beforeAll(() => {
  database = openDatabase();
  const cluster = DatabaseCluster.single(database);
  const scope = new TransactionScope();
  const shards = new ShardScope();
  settings = new PgNotificationSettingsRepository(cluster, scope, shards);
  organizations = new PgOrganizationReader(cluster, scope, shards);
});

afterAll(async () => {
  await database.close();
});

const due = async (hour: number) => {
  const found: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await organizations.pageDueForDigest(after as never, 500, 0, hour, 7);
    found.push(...page);
    if (page.length < 500) return found;
    after = page.at(-1) ?? null;
  }
};

describe("the digest hour, read by the hourly fan-out", () => {
  it("pages a tenant at its own hour, and at the default hour only when it chose none", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    try {
      expect(await due(7)).toContain(organizationId);

      await settings.saveDigestHour(organizationId, 19, new Date(), Uuid.v7() as never);
      expect(await settings.digestHourOf(organizationId)).toBe(19);
      expect(await due(19)).toContain(organizationId);
      expect(await due(7)).not.toContain(organizationId);
    } finally {
      await database.client
        .delete(notificationSettings)
        .where(eq(notificationSettings.organizationId, organizationId));
    }
  });
});

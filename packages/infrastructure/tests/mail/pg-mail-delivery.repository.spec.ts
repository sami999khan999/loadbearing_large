import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMailDeliveryRepository } from "../../src/pg/repository/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

let database: Database;
let deliveries: PgMailDeliveryRepository;

beforeAll(() => {
  database = openDatabase();
  deliveries = new PgMailDeliveryRepository(
    DatabaseCluster.single(database),
    new TransactionScope(),
    shards,
  );
});

afterAll(async () => {
  await database.close();
});

// Inside the current UTC month, which always has a partition.
const now = new Date();
const at = (minutes: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, minutes));

describe("PgMailDeliveryRepository", () => {
  it("lists one tenant's outcomes newest first, narrows by address, and pages by keyset", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const recipient = `${Uuid.v7()}@example.test`;
    const row = (minutes: number, to: string, status: "sent" | "failed" = "sent") => ({
      id: Uuid.v7(),
      organizationId,
      userId: null,
      template: "auth.verify",
      recipient: to,
      status,
      messageId: status === "sent" ? `<${minutes}@x>` : null,
      attempts: 1,
      createdAt: at(minutes),
    });
    await deliveries.save(row(1, recipient));
    await deliveries.save(row(2, "someone-else@example.test"));
    await deliveries.save(row(3, recipient, "failed"));

    const mine = await deliveries.list(organizationId, recipient, 10, null);
    expect(mine.map((delivery) => delivery.createdAt)).toEqual([at(3), at(1)]);
    expect(mine.map((delivery) => delivery.status)).toEqual(["failed", "sent"]);

    const [first] = await deliveries.list(organizationId, recipient, 1, null);
    const next = await deliveries.list(organizationId, recipient, 10, {
      createdAt: first?.createdAt ?? at(0),
      id: first?.id ?? "",
    });
    expect(next.map((delivery) => delivery.createdAt)).toEqual([at(1)]);
  });
});

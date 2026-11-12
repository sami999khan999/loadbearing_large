import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMailSettingsRepository } from "../../src/pg/repository/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";

let database: Database;
let settings: PgMailSettingsRepository;

beforeAll(() => {
  database = openDatabase();
  settings = new PgMailSettingsRepository(
    DatabaseCluster.single(database),
    new TransactionScope(),
    new ShardScope(),
  );
});

afterAll(async () => {
  await database.close();
});

describe("PgMailSettingsRepository", () => {
  it("saves, overwrites in place, and deletes one organization's server", async () => {
    const organizationId = Uuid.v7() as never;
    const row = {
      organizationId,
      host: "smtp.example.test",
      port: 587,
      secure: false,
      username: "u",
      passwordCiphertext: "v1.a.b.c",
      fromAddress: "a@example.test",
      updatedAt: new Date("2026-11-11T00:00:00.000Z"),
      updatedBy: Uuid.v7() as never,
    };
    try {
      await settings.save(row);
      await settings.save({ ...row, port: 465, secure: true });
      expect(await settings.findByOrganization(organizationId)).toMatchObject({
        port: 465,
        secure: true,
      });
    } finally {
      await settings.delete(organizationId);
    }
    expect(await settings.findByOrganization(organizationId)).toBeNull();
  });
});

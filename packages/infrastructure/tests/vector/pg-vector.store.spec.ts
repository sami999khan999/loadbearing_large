import { Identifiers } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { PgVectorStore } from "../../src/pg/repository/pg-vector.store.js";
import { documentChunks, organizations } from "../../src/pg/schema/index.js";
import { TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

let database: Database;
let store: PgVectorStore;

// A unit vector on one axis, plus a near neighbour and an orthogonal one. Cosine
// similarity is then 1, ~0.99, and 0 — enough to prove ordering and the floor.
const axis = (index: number): number[] =>
  Array.from({ length: 1536 }, (_, i) => (i === index ? 1 : 0));

const blend = (a: number, b: number): number[] =>
  Array.from({ length: 1536 }, (_, i) => (i === a ? 0.99 : i === b ? 0.14 : 0));

beforeAll(() => {
  database = openDatabase();
  store = new PgVectorStore(database, new TransactionScope());
});

afterAll(async () => {
  await database.close();
});

const seedOrg = () => seedOrganizationId(database);

describe("PgVectorStore", () => {
  it("returns org-wide chunks only when the permitted scope is empty", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const goalId = Identifiers.goalId.parse(Uuid.v7());

    await store.upsert(organizationId, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "org-wide chunk",
        embedding: axis(0),
        metadata: { chunkIndex: 0, sourceType: "note" },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId,
        content: "goal-scoped chunk",
        embedding: axis(0),
        metadata: { chunkIndex: 1, sourceType: "note" },
      },
    ]);

    const withoutScope = await store.search(organizationId, axis(0), [], 10);
    expect(withoutScope.map((h) => h.content)).toEqual(["org-wide chunk"]);

    const withScope = await store.search(organizationId, axis(0), [goalId], 10);
    expect(withScope.map((h) => h.content).sort()).toEqual(["goal-scoped chunk", "org-wide chunk"]);

    await store.deleteBySource(organizationId, sourceId);
  });

  it("orders by similarity and drops everything under the floor", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();

    await store.upsert(organizationId, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "exact",
        embedding: axis(1),
        metadata: { chunkIndex: 0 },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "near",
        embedding: blend(1, 2),
        metadata: { chunkIndex: 1 },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "orthogonal",
        embedding: axis(3),
        metadata: { chunkIndex: 2 },
      },
    ]);

    const hits = await store.search(organizationId, axis(1), [], 10);

    // "orthogonal" scores 0, below MIN_SCORE, so the floor removes it entirely.
    expect(hits.map((h) => h.content)).toEqual(["exact", "near"]);
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);

    await store.deleteBySource(organizationId, sourceId);
  });

  it("does not leak across organizations", async () => {
    const organizationId = await seedOrg();
    const otherOrg = Identifiers.organizationId.parse(Uuid.v7());
    const sourceId = Uuid.v7();

    await database.client
      .insert(organizations)
      .values({ id: otherOrg, slug: `other-${sourceId}`, name: "Other" });

    await store.upsert(otherOrg, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "other tenant chunk",
        embedding: axis(0),
        metadata: { chunkIndex: 0 },
      },
    ]);

    const hits = await store.search(organizationId, axis(0), [], 10);
    expect(hits.map((h) => h.content)).not.toContain("other tenant chunk");

    await store.deleteBySource(otherOrg, sourceId);
    await database.client.delete(organizations).where(eq(organizations.id, otherOrg));
  });

  it("upsert replaces content for an existing id", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const id = Uuid.v7();

    const chunk = {
      id,
      sourceId,
      goalId: null,
      content: "first",
      embedding: axis(5),
      metadata: { chunkIndex: 0 },
    };

    await store.upsert(organizationId, [chunk]);
    await store.upsert(organizationId, [{ ...chunk, content: "second" }]);

    const rows = await database.client
      .select({ content: documentChunks.content })
      .from(documentChunks)
      .where(and(eq(documentChunks.id, id), eq(documentChunks.organizationId, organizationId)));

    expect(rows).toEqual([{ content: "second" }]);

    await store.deleteBySource(organizationId, sourceId);
  });
});

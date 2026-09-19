import { afterAll, describe, expect, inject, it } from "vitest";
import {
  asc,
  eq,
  Identifiers,
  migrate,
  type OrganizationId,
  PartitionedTable,
  sql,
  Uuid,
} from "../../src/import.js";
import { Database, DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "../../src/pg/repository/index.js";
import { organizations } from "../../src/pg/schema/index.js";
import { TenantPartitionSeed } from "../../src/pg/seed/index.js";
import { PgUnitOfWork, ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import type {} from "./support/stack.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();

const stack = inject("stack");

// What decision D29 claimed without measuring: "a few hundred tenants per node is
// comfortable". This is the measurement, and `partitions.md` carries its numbers.

// Direct, never pooled: every statement here is DDL.
const database = new Database({ url: stack.database.directUrl });
const scope = new TransactionScope();
const seed = new TenantPartitionSeed(DatabaseCluster.single(database), scope, shards);
const maintenance = new PgMaintenanceGateway(
  DatabaseCluster.single(database),
  scope,
  shards,
  new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "catalog"),
);

// The slug every synthetic tenant carries, so cleanup can find them without holding a
// list — a run killed half way through leaves them findable.
const SLUG = "ceiling-";

const created: OrganizationId[] = [];

interface Reading {
  readonly tenants: number;
  readonly partitions: number;
  readonly createMs: number;
  readonly planMs: number;
  readonly execMs: number;
  readonly runwayMs: number;
  readonly migrateMs: number;
}

const readings: Reading[] = [];

const timed = async <T>(work: () => Promise<T>): Promise<[T, number]> => {
  const started = performance.now();
  const value = await work();
  return [value, Math.round(performance.now() - started)];
};

const mint = async (): Promise<OrganizationId> => {
  const id = Identifiers.organizationId.parse(Uuid.v7());
  await database.client.insert(organizations).values({ id, slug: `${SLUG}${id}`, name: "Ceiling" });
  await seed.run(id);
  created.push(id);
  return id;
};

// The planner's own numbers, split: planning is what grows with the partition count, and
// execution is what the tenant level is supposed to keep flat.
const explain = async (organizationId: OrganizationId) => {
  const rows = await database.client.execute<Record<string, unknown>>(sql`
    explain (analyze, format json)
    select id, created_at from notifications
    where organization_id = ${organizationId}
    order by created_at desc, id desc
    limit 20
  `);

  const root = rows.rows[0]?.["QUERY PLAN"];
  const plan = (typeof root === "string" ? JSON.parse(root) : root) as [
    { "Planning Time": number; "Execution Time": number },
  ];

  return { planMs: plan[0]["Planning Time"], execMs: plan[0]["Execution Time"] };
};

// Every tenant's runway for every month-partitioned table — what the monthly schedule and
// `pnpm db:partitions` both do, and the cost that bounds tenants per node.
const runway = async (): Promise<void> => {
  for (const id of created) {
    for (const entry of [
      { name: "activity_log" },
      { name: "notifications" },
      { name: "messages" },
    ]) {
      await maintenance.ensureMonthlyPartitions(
        entry.name as Parameters<typeof maintenance.ensureMonthlyPartitions>[0],
        id,
        new Date(),
        3,
      );
    }
  }
};

// Tables only. `pg_inherits` carries a row per *index* partition too, and a partitioned
// table with five indexes makes that number six times the one anybody means by it.
const partitionCount = async (): Promise<number> => {
  const rows = await database.client.execute<{ count: string }>(sql`
    select count(*)::text as count
    from pg_inherits
    join pg_class child on child.oid = pg_inherits.inhrelid
    where child.relkind in ('r', 'p')
  `);
  return Number(rows.rows[0]?.count ?? "0");
};

// Detach and drop rather than `CASCADE`, for the reason `dropTenantPartitions` gives: a
// key referencing a partitioned table is a constraint on the parent.
const dropOrphans = async (): Promise<number> => {
  const rows = await database.client.execute<{ parent: string; child: string }>(sql`
    select parent.relname as parent, child.relname as child
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    where child.relkind in ('r', 'p')
      and child.relname ~ ('^' || parent.relname || '_[0-9a-f]{32}$')
      and not exists (
        select 1 from organizations o
        where child.relname = parent.relname || '_' || replace(o.id::text, '-', '')
      )
  `);

  // Referents before the table they reference, which is the reverse of the allowlist —
  // the same order `dropTenantPartitions` walks, for the same reason.
  const order: readonly string[] = [...PartitionedTable.TENANT_PARTITIONED]
    .reverse()
    .map((entry) => entry.name);
  const sorted = [...rows.rows].sort((a, b) => order.indexOf(a.parent) - order.indexOf(b.parent));

  for (const { parent, child } of sorted) {
    await database.client.execute(sql.raw(`alter table ${parent} detach partition ${child}`));
    await database.client.execute(sql.raw(`drop table ${child}`));
  }

  return sorted.length;
};

afterAll(
  async () => {
    // Printed before the cleanup, never after: dropping tens of thousands of partitions is
    // the slowest thing here, and a run whose numbers died with it measured nothing.
    if (readings.length > 0) console.table(readings);

    // Any tenant partition whose organization is gone, first: the drop is one transaction
    // and the row delete after it another, so a dying process commits the second alone.
    await dropOrphans();

    // Every synthetic tenant, found by slug rather than from the list above: a run that
    // died half way through still has to be cleanable by running this again.
    for (;;) {
      const page = await database.client
        .select({ id: organizations.id })
        .from(organizations)
        .where(sql`${organizations.slug} like ${`${SLUG}%`}`)
        .orderBy(asc(organizations.id))
        .limit(200);

      if (page.length === 0) break;
      for (const { id } of page) {
        await maintenance.dropTenantPartitions(id);
        await database.client.delete(organizations).where(eq(organizations.id, id));
      }
    }

    await database.close();
    // The cleanup drops as many partitions as the run created, so it is the hook that needs
    // the hour rather than the test.
  },
  60 * 60 * 1_000,
);

// `skipIf`, not a bare `if`: a suite that silently contains no tests is indistinguishable
// from one that ran and found nothing.
describe.skipIf(!stack.tenantCeiling)("the tenant ceiling", () => {
  for (const target of stack.tenantCeiling ?? []) {
    // Minutes, not seconds: at two thousand tenants this is thirty-two thousand tables.
    it(
      `measures a node carrying ${target} tenants`,
      async () => {
        // Before the first reading, not only after the last: a previous run killed
        // mid-cleanup leaves partitions behind, and they would be counted as this one's.
        await dropOrphans();

        const [, createMs] = await timed(async () => {
          while (created.length < target) await mint();
        });

        const probe = created[0];
        if (!probe) throw new Error("expected at least one tenant");

        // Warmed once, because the first plan of the session pays for the catalog read
        // and the number that matters is the steady-state one.
        await explain(probe);
        const [{ planMs, execMs }] = await timed(() => explain(probe));
        const [, runwayMs] = await timed(runway);
        const [, migrateMs] = await timed(() =>
          migrate(database.client, { migrationsFolder: "./migrations" }),
        );

        readings.push({
          tenants: created.length,
          partitions: await partitionCount(),
          createMs,
          planMs,
          execMs,
          runwayMs,
          migrateMs,
        });

        // Not a threshold — this file measures rather than gates. The assertion is only
        // that every reading exists, so a run that silently produced none fails.
        expect(readings.at(-1)?.partitions).toBeGreaterThan(target);
      },
      60 * 60 * 1_000,
    );
  }
});

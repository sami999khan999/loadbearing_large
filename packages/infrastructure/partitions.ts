// The runway, by hand. `MaintenanceConsumer` does this monthly; this is the same routine
// for the operator whose worker was down on the first of the month.

import "dotenv/config";
import { asc, gt, type OrganizationId, PartitionedTable } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";
import { PgMaintenanceGateway } from "./src/pg/repository/index.js";
import { organizations } from "./src/pg/schema/index.js";
import { PgUnitOfWork, TransactionScope } from "./src/pg/transaction/index.js";

// The same three the schedule keeps ahead — the current month and the next two — so
// running this by hand cannot leave a different runway from running it on the clock.
const MONTHS = 3;

// Tenants per page, the same size the worker walks them in.
const PAGE = 200;

// Direct, never pooled: this is DDL, and a transaction pooler is the wrong place for it.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");

const database = new Database({ url });
const scope = new TransactionScope();
const maintenance = new PgMaintenanceGateway(database, scope, new PgUnitOfWork(database, scope));
const now = new Date();

interface Row {
  readonly table: string;
  readonly tenant: string;
  readonly created: number;
  readonly ahead: number;
}

const rows: Row[] = [];

// Read *before* ensuring, for the reason the consumer gives: afterwards there is nothing
// to report, because the run has just fixed whatever it found.
const cover = async (
  table: (typeof PartitionedTable.NAMES)[number],
  tenant: OrganizationId | null,
) => {
  const ahead = await maintenance.monthlyPartitionsAfter(table, tenant, now);
  const created = await maintenance.ensureMonthlyPartitions(table, tenant, now, MONTHS);

  rows.push({ table, tenant: tenant ?? "—", created: created.length, ahead });
};

for (const entry of PartitionedTable.MONTH_PARTITIONED) {
  if (!entry.tenantKey) {
    await cover(entry.name, null);
    continue;
  }

  let after: OrganizationId | null = null;

  for (;;) {
    const page = await database.client
      .select({ id: organizations.id })
      .from(organizations)
      .where(after ? gt(organizations.id, after) : undefined)
      .orderBy(asc(organizations.id))
      .limit(PAGE);

    if (page.length === 0) break;
    for (const { id } of page) await cover(entry.name, id);

    after = page[page.length - 1]?.id ?? null;
    if (page.length < PAGE) break;
  }
}

await database.close();

// `ahead` is what existed before this run, so a zero there is the reading that matters:
// it says the next insert past month end would have failed.
console.table(rows);

const starved = rows.filter((row) => row.ahead < 2);
if (starved.length > 0) {
  console.log(`${starved.length} of ${rows.length} had under two months of runway.`);
}

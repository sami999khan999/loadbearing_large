import {
  InternalError,
  type OrganizationId,
  PartitionedTable,
  type PartitionedTableEntry,
  type Placement,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";

// How many months of runway a new tenant is given: the current one and the next two, the
// same count `MaintenanceConsumer` keeps ahead so the two cannot disagree.
const MONTHS = 3;

// Every tenant-owned table is partitioned by `organization_id`, so a row for a tenant
// with no partition is an insert error. This runs wherever an organization is created.
export class TenantPartitionSeed extends BaseRepository {
  // Partition DDL; `22.17` loops it per node.
  protected override readonly placement: Placement = "local";

  // Returns the partitions it created, empty on a tenant that already has them — the
  // idempotence every caller below depends on, since three of them can run twice.
  public async run(organizationId: OrganizationId): Promise<readonly string[]> {
    const created: string[] = [];

    for (const entry of PartitionedTable.TENANT_PARTITIONED) {
      const tenant = TenantPartitionSeed.partitionName(entry.name, organizationId);

      if (!(await this.exists(tenant))) {
        // Created standalone and then attached, never `create table … partition of`: that
        // form holds ACCESS EXCLUSIVE on the parent for the rest of the transaction.
        const level = entry.column ? ` partition by range ("${entry.column}")` : "";
        await this.db.execute(
          sql.raw(`create table ${tenant} (like ${entry.name} including all)${level}`),
        );
        await this.db.execute(
          sql.raw(
            `alter table ${entry.name} attach partition ${tenant} for values in ('${organizationId}')`,
          ),
        );
        created.push(tenant);
      }

      created.push(...(await this.months(entry, tenant)));
    }

    return created;
  }

  // The month level under one tenant partition, from the current month forward. Same
  // create-then-attach, for the same lock reason.
  private async months(entry: PartitionedTableEntry, tenant: string): Promise<readonly string[]> {
    if (!entry.column) return [];

    const created: string[] = [];
    const now = new Date();

    for (let offset = 0; offset < MONTHS; offset += 1) {
      const start = TenantPartitionSeed.monthStart(now, offset);
      const end = TenantPartitionSeed.monthStart(now, offset + 1);
      const name = `${tenant}_${TenantPartitionSeed.month(start)}`;
      if (await this.exists(name)) continue;

      await this.db.execute(sql.raw(`create table ${name} (like ${tenant} including all)`));
      await this.db.execute(
        sql.raw(
          `alter table ${tenant} attach partition ${name} ` +
            `for values from ('${TenantPartitionSeed.iso(start)}') to ('${TenantPartitionSeed.iso(end)}')`,
        ),
      );
      created.push(name);
    }

    return created;
  }

  // `to_regclass` returns null rather than throwing, which `CREATE TABLE IF NOT EXISTS`
  // cannot tell us: it reports nothing about what it did.
  private async exists(name: string): Promise<boolean> {
    const probe = await this.db.execute<{ present: string | null }>(
      sql`select to_regclass(${`public.${name}`})::text as present`,
    );
    return Boolean(probe.rows[0]?.present);
  }

  // `<table>_<32hex>`, derived here alone and validated before it reaches `sql.raw`. The
  // longest is `notification_preferences_<32>` at 57 of Postgres's 63 characters.
  public static partitionName(table: string, organizationId: OrganizationId): string {
    const hex = organizationId.replaceAll("-", "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) {
      throw new InternalError(new Error(`Not an organization id: ${organizationId}`));
    }
    return `${table}_${hex}`;
  }

  // UTC throughout: a boundary computed in the host's zone puts the first hours of a
  // month into the previous partition, or into none at all.
  private static monthStart(from: Date, offset: number): Date {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
  }

  private static month(start: Date): string {
    return `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

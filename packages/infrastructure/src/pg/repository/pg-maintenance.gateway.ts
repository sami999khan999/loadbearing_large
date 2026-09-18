import {
  InternalError,
  lt,
  type MaintenanceGateway,
  type OrganizationId,
  type PartitionEstimate,
  PartitionedTable,
  type PartitionedTableName,
  type SweepOutcome,
  sql,
  type UnitOfWork,
} from "../../import.js";
import { BaseRepository, type Database } from "../primitive/index.js";
import { invitations, sessions, verifications } from "../schema/index.js";
import { TenantPartitionSeed } from "../seed/index.js";
import type { TransactionScope } from "../transaction/index.js";

// One child of the parent, with what the retention preview wants to know about it.
interface ChildRow extends Record<string, unknown> {
  readonly name: string;
  readonly estimated_rows: string;
  readonly bytes: string;
}

export class PgMaintenanceGateway extends BaseRepository implements MaintenanceGateway {
  // A fixed namespace for `pg_advisory_xact_lock`'s two-argument form, so this lock
  // cannot collide with one taken for another reason.
  private static readonly LOCK_NAMESPACE = 0x6c62_0002 | 0;

  private readonly tenantPartitions = new TenantPartitionSeed(this.database, this.scope);

  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly unitOfWork: UnitOfWork,
  ) {
    super(database, scope);
  }

  public async sweepExpired(now: Date): Promise<SweepOutcome> {
    // Two statements rather than one CTE: they hit different indexes, and a failure
    // sweeping one should not hold the other's rows.
    const expiredSessions = await this.db.delete(sessions).where(lt(sessions.expiresAt, now));

    const expiredVerifications = await this.db
      .delete(verifications)
      .where(lt(verifications.expiresAt, now));

    // Swept for a reason the other two do not have: `invitations_email_uq` means a lapsed
    // row keeps that address un-invitable until it is gone.
    const expiredInvitations = await this.db
      .delete(invitations)
      .where(lt(invitations.expiresAt, now));

    // The command tag, never `.returning()`: the caller wants a count, and returning ids
    // ships every expired row back over the wire to be counted and thrown away.
    return {
      sessions: expiredSessions.rowCount ?? 0,
      verifications: expiredVerifications.rowCount ?? 0,
      invitations: expiredInvitations.rowCount ?? 0,
    };
  }

  // Delegated rather than reimplemented: the signup path calls the seed directly inside
  // its own transaction, and a second copy here is the one that drifts.
  public ensureTenantPartitions(organizationId: OrganizationId): Promise<readonly string[]> {
    return this.tenantPartitions.run(organizationId);
  }

  // **Detach, then drop, never `CASCADE`:** a key referencing a partitioned table is a
  // constraint on the parent, and cascading takes it from every tenant at once.
  public async dropTenantPartitions(organizationId: OrganizationId): Promise<readonly string[]> {
    const dropped: string[] = [];

    await this.unitOfWork.run(async () => {
      // Backwards, because the allowlist lists a table ahead of the tables that
      // reference it and Postgres refuses to detach a partition still referenced.
      for (const entry of [...PartitionedTable.TENANT_PARTITIONED].reverse()) {
        const name = TenantPartitionSeed.partitionName(entry.name, organizationId);
        if (!(await this.exists(name))) continue;

        await this.db.execute(sql.raw(`alter table ${entry.name} detach partition ${name}`));
        await this.db.execute(sql.raw(`drop table ${name}`));
        dropped.push(name);
      }
    });

    return dropped;
  }

  // `to_regclass` returns null rather than throwing, so a tenant whose partitions are
  // already gone is a no-op rather than an error the caller has to distinguish.
  private async exists(name: string): Promise<boolean> {
    const probe = await this.db.execute<{ present: string | null }>(
      sql`select to_regclass(${`public.${name}`})::text as present`,
    );
    return Boolean(probe.rows[0]?.present);
  }

  public async ensureMonthlyPartitions(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    from: Date,
    months: number,
  ): Promise<readonly string[]> {
    const parent = this.monthParent(table, organizationId);
    const created: string[] = [];

    // One transaction holding one advisory lock per table, because probe-and-create is
    // two statements: two replicas booting together both probe absent and one gets 42P07.
    await this.unitOfWork.run(async () => {
      const lock = PgMaintenanceGateway.lockFor(table);
      await this.db.execute(sql`select pg_advisory_xact_lock(${lock.namespace}, ${lock.key})`);

      // From the month `from` falls in, inclusive — so `months` is a count of partitions
      // and the runway it buys is one less than that.
      for (let offset = 0; offset < months; offset += 1) {
        const start = PgMaintenanceGateway.monthStart(from, offset);
        const end = PgMaintenanceGateway.monthStart(from, offset + 1);
        const name = `${parent}_${PgMaintenanceGateway.monthSuffix(start)}`;

        // `to_regclass` returns null rather than throwing, which `CREATE TABLE IF NOT
        // EXISTS … PARTITION OF` cannot tell us: it reports nothing about what it did.
        const probe = await this.db.execute<{ present: string | null }>(
          sql`select to_regclass(${`public.${name}`})::text as present`,
        );
        if (probe.rows[0]?.present) continue;

        // Created standalone and then attached, for the lock reason `TenantPartitionSeed`
        // gives. Inlined because Postgres accepts no bind parameters in DDL.
        await this.db.execute(sql.raw(`create table ${name} (like ${parent} including all)`));
        await this.db.execute(
          sql.raw(
            `alter table ${parent} attach partition ${name} ` +
              `for values from ('${PgMaintenanceGateway.iso(start)}') to ('${PgMaintenanceGateway.iso(end)}')`,
          ),
        );

        created.push(name);
      }
    });

    return created;
  }

  // Strictly after the month `from` falls in, so the current month is never counted as
  // runway — it is the one being written to.
  public async monthlyPartitionsAfter(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    from: Date,
  ): Promise<number> {
    const parent = this.monthParent(table, organizationId);
    const boundary = PgMaintenanceGateway.monthStart(from, 1);
    const children = await this.childrenOf(parent);

    return children.filter((child) => {
      const start = PgMaintenanceGateway.partitionMonth(parent, child.name);
      return start !== null && start.getTime() >= boundary.getTime();
    }).length;
  }

  public async dropMonthlyPartitionsBefore(
    table: PartitionedTableName,
    organizationId: OrganizationId | null,
    cutoff: Date,
  ): Promise<readonly string[]> {
    const entry = PartitionedTable.byName(table);
    // Null on a tenant-partitioned table is every tenant, the same reading
    // `partitionsBefore` has — otherwise a caller previews across tenants and drops one.
    const parents =
      entry.tenantKey && !organizationId
        ? await this.tenantPartitionsOf(table)
        : [this.monthParent(table, organizationId)];

    const boundary = PgMaintenanceGateway.monthStart(cutoff, 0);
    const dropped: string[] = [];

    for (const parent of parents) {
      for (const child of await this.childrenOf(parent)) {
        const start = PgMaintenanceGateway.partitionMonth(parent, child.name);
        // A name the pattern does not match is left alone rather than dropped: this
        // loop holds a `drop table`, and "I could not parse it" is not a reason to run.
        if (!start || start.getTime() >= boundary.getTime()) continue;

        // Re-derived from the parsed month, never interpolated from the catalog string.
        await this.db.execute(
          sql.raw(`drop table if exists ${parent}_${PgMaintenanceGateway.monthSuffix(start)}`),
        );
        dropped.push(child.name);
      }
    }

    return dropped;
  }

  // Across every tenant when `organizationId` is null, and the same parse the drop uses
  // off the same read — so the two cannot disagree about what a child is.
  public async partitionsBefore(
    table: PartitionedTableName,
    cutoff: Date,
    organizationId?: OrganizationId | null,
  ): Promise<readonly PartitionEstimate[]> {
    const entry = PartitionedTable.byName(table);
    const parents =
      entry.tenantKey && !organizationId
        ? await this.tenantPartitionsOf(table)
        : [this.monthParent(table, organizationId ?? null)];

    const boundary = PgMaintenanceGateway.monthStart(cutoff, 0);
    const estimates: PartitionEstimate[] = [];

    for (const parent of parents) {
      for (const child of await this.childrenOf(parent)) {
        const period = PgMaintenanceGateway.partitionMonth(parent, child.name);
        if (!period || period.getTime() >= boundary.getTime()) continue;

        estimates.push({
          name: child.name,
          period,
          // `reltuples` is the planner's estimate, refreshed by autovacuum or ANALYZE,
          // and -1 on a child never analysed — hence the floor, and hence "about".
          estimatedRows: Math.max(0, Number(child.estimated_rows)),
          bytes: Number(child.bytes),
        });
      }
    }

    return estimates;
  }

  // The parent a month hangs off: the tenant partition, or the table for `outbox_event`.
  // An argument disagreeing with the allowlist is an error here, not a wrong `drop table`.
  private monthParent(table: PartitionedTableName, organizationId: OrganizationId | null): string {
    const entry = PartitionedTable.byName(table);
    if (!entry.column) throw new InternalError(new Error(`${table} has no month level`));

    if (!entry.tenantKey) {
      if (organizationId) throw new InternalError(new Error(`${table} has no tenant level`));
      return table;
    }

    if (!organizationId) throw new InternalError(new Error(`${table} is partitioned by tenant`));
    return TenantPartitionSeed.partitionName(table, organizationId);
  }

  // From the catalog rather than from a date range: a gap in the sequence, or a month
  // created by hand, is still a partition and still has to be found.
  private async childrenOf(parent: string): Promise<readonly ChildRow[]> {
    const rows = await this.db.execute<ChildRow>(sql`
      select child.relname as name,
             greatest(child.reltuples, 0)::bigint::text as estimated_rows,
             pg_total_relation_size(child.oid)::bigint::text as bytes
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      where parent.relname = ${parent}
      order by child.relname
    `);

    return rows.rows;
  }

  // Read from the catalog rather than from `organizations`: a partition with no tenant
  // row is exactly the leak this read exists to show.
  private async tenantPartitionsOf(table: PartitionedTableName): Promise<readonly string[]> {
    return (await this.childrenOf(table)).map((child) => child.name);
  }

  // Public because an advisory lock *is* a cross-process protocol: another process has
  // to be able to name the same lock, and a spec proving the guard is one of them.
  public static lockFor(table: PartitionedTableName): { namespace: number; key: number } {
    // The table name folded to an int. A collision would only make two tables ensure
    // their partitions one after the other.
    let hash = 0;
    for (const char of table) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
    return { namespace: PgMaintenanceGateway.LOCK_NAMESPACE, key: hash };
  }

  // UTC throughout: a boundary computed in the host's zone puts the first hours of a
  // month into the previous partition, or into none at all.
  private static monthStart(from: Date, offset: number): Date {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
  }

  private static monthSuffix(start: Date): string {
    return `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  // Null for anything that is not `<parent>_<yyyy>_<mm>`, which is what makes the drop
  // loop above safe to run over whatever the catalog happens to return.
  private static partitionMonth(parent: string, name: string): Date | null {
    const escaped = parent.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`^${escaped}_(\\d{4})_(\\d{2})$`).exec(name);
    if (!match?.[1] || !match[2]) return null;

    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;

    return new Date(Date.UTC(Number(match[1]), month - 1, 1));
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

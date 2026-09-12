import {
  lt,
  type MaintenanceGateway,
  type PartitionedTableName,
  type SweepOutcome,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { invitations, sessions, verifications } from "../schema/index.js";

export class PgMaintenanceGateway extends BaseRepository implements MaintenanceGateway {
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

  public async ensureMonthlyPartitions(
    table: PartitionedTableName,
    from: Date,
    months: number,
  ): Promise<readonly string[]> {
    const created: string[] = [];

    // From the month `from` falls in, inclusive — so `months` is a count of partitions
    // and the runway it buys is one less than that.
    for (let offset = 0; offset < months; offset += 1) {
      const start = PgMaintenanceGateway.monthStart(from, offset);
      const end = PgMaintenanceGateway.monthStart(from, offset + 1);
      const name = PgMaintenanceGateway.partitionName(table, start);

      // `to_regclass` returns null rather than throwing, which `CREATE TABLE IF NOT
      // EXISTS … PARTITION OF` cannot tell us: it reports nothing about what it did.
      const probe = await this.db.execute<{ present: string | null }>(
        sql`select to_regclass(${`public.${name}`})::text as present`,
      );
      if (probe.rows[0]?.present) continue;

      // Inlined because Postgres accepts **no** bind parameters in DDL, not even for the
      // range bounds. No injection surface: dates, and a table name from a closed union.
      await this.db.execute(
        sql.raw(
          `create table ${name} partition of ${table} ` +
            `for values from ('${PgMaintenanceGateway.iso(start)}') to ('${PgMaintenanceGateway.iso(end)}')`,
        ),
      );

      created.push(name);
    }

    return created;
  }

  public async dropMonthlyPartitionsBefore(
    table: PartitionedTableName,
    cutoff: Date,
  ): Promise<readonly string[]> {
    // From the catalog rather than from a date range: a gap in the sequence, or a month
    // created by hand, is still a partition and still has to be found to be dropped.
    const children = await this.db.execute<{ name: string }>(sql`
      select child.relname as name
      from pg_inherits
      join pg_class parent on parent.oid = pg_inherits.inhparent
      join pg_class child on child.oid = pg_inherits.inhrelid
      where parent.relname = ${table}
    `);

    const boundary = PgMaintenanceGateway.monthStart(cutoff, 0);
    const dropped: string[] = [];

    for (const row of children.rows) {
      const start = PgMaintenanceGateway.partitionMonth(table, row.name);
      // A name the pattern does not match is left alone rather than dropped: this loop
      // is holding a `drop table`, and "I could not parse it" is not a reason to run one.
      if (!start || start.getTime() >= boundary.getTime()) continue;

      // Re-derived from the parsed month, never interpolated from the catalog string.
      await this.db.execute(
        sql.raw(`drop table if exists ${PgMaintenanceGateway.partitionName(table, start)}`),
      );
      dropped.push(row.name);
    }

    return dropped;
  }

  // UTC throughout: a boundary computed in the host's zone puts the first hours of a
  // month into the previous partition, or into none at all.
  private static monthStart(from: Date, offset: number): Date {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
  }

  private static partitionName(table: PartitionedTableName, start: Date): string {
    const month = String(start.getUTCMonth() + 1).padStart(2, "0");
    return `${table}_${start.getUTCFullYear()}_${month}`;
  }

  // Null for anything that is not `<table>_<yyyy>_<mm>`, which is what makes the drop
  // loop above safe to run over whatever the catalog happens to return.
  private static partitionMonth(table: PartitionedTableName, name: string): Date | null {
    const match = new RegExp(`^${table}_(\\d{4})_(\\d{2})$`).exec(name);
    if (!match?.[1] || !match[2]) return null;

    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;

    return new Date(Date.UTC(Number(match[1]), month - 1, 1));
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

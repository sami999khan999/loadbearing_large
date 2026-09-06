import { lt, type MaintenanceGateway, type SweepOutcome, sql } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { sessions, verifications } from "../schema/index.js";

export class PgMaintenanceGateway extends BaseRepository implements MaintenanceGateway {
  public async sweepExpired(now: Date): Promise<SweepOutcome> {
    // Two statements rather than one CTE: they hit different indexes, and a failure
    // sweeping one should not hold the other's rows.
    const expiredSessions = await this.db.delete(sessions).where(lt(sessions.expiresAt, now));

    const expiredVerifications = await this.db
      .delete(verifications)
      .where(lt(verifications.expiresAt, now));

    // The command tag, never `.returning()`: the caller wants a count, and returning ids
    // ships every expired row back over the wire to be counted and thrown away.
    return {
      sessions: expiredSessions.rowCount ?? 0,
      verifications: expiredVerifications.rowCount ?? 0,
    };
  }

  public async ensureActivityPartitions(
    from: Date,
    monthsAhead: number,
  ): Promise<readonly string[]> {
    const created: string[] = [];

    for (let offset = 0; offset < monthsAhead; offset += 1) {
      const start = PgMaintenanceGateway.monthStart(from, offset);
      const end = PgMaintenanceGateway.monthStart(from, offset + 1);
      const name = PgMaintenanceGateway.partitionName(start);

      // `to_regclass` returns null rather than throwing, which `CREATE TABLE IF NOT
      // EXISTS … PARTITION OF` cannot tell us: it reports nothing about what it did.
      const probe = await this.db.execute<{ present: string | null }>(
        sql`select to_regclass(${`public.${name}`})::text as present`,
      );
      if (probe.rows[0]?.present) continue;

      // Inlined because Postgres accepts **no** bind parameters in DDL, not even for the
      // range bounds. No injection surface: every value is derived from a `Date`.
      await this.db.execute(
        sql.raw(
          `create table ${name} partition of activity_log ` +
            `for values from ('${PgMaintenanceGateway.iso(start)}') to ('${PgMaintenanceGateway.iso(end)}')`,
        ),
      );

      created.push(name);
    }

    return created;
  }

  // UTC throughout: a boundary computed in the host's zone puts the first hours of a
  // month into the previous partition, or into none at all.
  private static monthStart(from: Date, offset: number): Date {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));
  }

  private static partitionName(start: Date): string {
    const month = String(start.getUTCMonth() + 1).padStart(2, "0");
    return `activity_log_${start.getUTCFullYear()}_${month}`;
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

import { lt, type MaintenanceGateway, type SweepOutcome, sql } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { sessions, verifications } from "../schema/index.js";

export class PgMaintenanceGateway extends BaseRepository implements MaintenanceGateway {
  public async sweepExpired(now: Date): Promise<SweepOutcome> {
    // Two statements rather than one CTE: they hit different indexes
    // (`sessions_expires_idx`, `verifications_expires_idx`) and neither cares whether
    // the other succeeded. A failure sweeping one should not hold the other's rows.
    const expiredSessions = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))
      .returning({ id: sessions.id });

    const expiredVerifications = await this.db
      .delete(verifications)
      .where(lt(verifications.expiresAt, now))
      .returning({ id: verifications.id });

    return { sessions: expiredSessions.length, verifications: expiredVerifications.length };
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

      // `to_regclass` returns null for a name that does not exist, and never throws —
      // which `CREATE TABLE IF NOT EXISTS … PARTITION OF` cannot tell us, because it
      // reports nothing about whether it did anything.
      const probe = await this.db.execute<{ present: string | null }>(
        sql`select to_regclass(${`public.${name}`})::text as present`,
      );
      if (probe.rows[0]?.present) continue;

      // Every value in this statement is inlined, and it has to be: Postgres accepts
      // **no** bind parameters in DDL, not for the identifiers and not for the range
      // bounds either. The parameterised form fails at bind time with
      // `bind message supplies 2 parameters, but prepared statement "" requires 0`,
      // which is a runtime error a type-checker cannot see and a unit test against a
      // fake cannot reach — this ran green for months while creating no partitions.
      //
      // Nothing here is an injection surface. `name` and both bounds are derived
      // entirely from a `Date`, and `iso()` formats them; no caller-supplied string
      // reaches this statement.
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

  // UTC throughout. A partition boundary computed in the host's local zone puts rows
  // from the first hours of a month into the previous partition, or into none at all.
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

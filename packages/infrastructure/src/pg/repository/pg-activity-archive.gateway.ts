import {
  type ActivityArchiveGateway,
  type ArchivedPartition,
  createGzip,
  once,
  Readable,
  type StorageGateway,
  sql,
} from "../../import.js";
import type { Database } from "../primitive/index.js";
import { BaseRepository } from "../primitive/index.js";
import { activityArchive } from "../schema/index.js";
import type { TransactionScope } from "../transaction/index.js";

// Rows per round trip out of the detached partition. Large enough that the cursor
// overhead disappears, small enough that one batch is a few megabytes of JSON.
const PAGE = 10_000;

// NDJSON is newline-delimited by definition, so the separator is data rather than
// formatting — naming it keeps a formatter from ever treating it as the latter.
const NEWLINE = "\n";

// An alias rather than an interface: drizzle's `execute<T>` constrains `T` to
// `Record<string, unknown>`, and only aliases get an implicit index signature.
type ArchiveRow = {
  occurred_at: string;
  id: string;
  line: string;
};

interface Cursor {
  readonly occurredAt: string;
  readonly id: string;
}

export class PgActivityArchiveGateway extends BaseRepository implements ActivityArchiveGateway {
  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly storage: StorageGateway,
  ) {
    super(database, scope);
  }

  // detach → stream to S3 → record → verify → drop. The order is the job: dropping before
  // verifying is unrecoverable. See docs/reference/activity-archive.md.
  public async archive(period: Date): Promise<ArchivedPartition> {
    const name = PgActivityArchiveGateway.partitionName(period);
    const key = PgActivityArchiveGateway.objectKey(period);

    // ── 1. detach ──
    // CONCURRENTLY so the parent is not locked against writers while it happens. It
    // cannot run inside a transaction, which is also why this whole method is not one.
    await this.db.execute(
      sql`alter table ${sql.identifier("activity_log")} detach partition ${sql.identifier(name)} concurrently`,
    );

    // Built before the try so the failure path can stop them. `Readable.from` pulls as
    // soon as it is piped, and a rejected upload leaves it paging a partition nobody reads.
    const source = Readable.from(this.rows(name));
    // Gzipped in between the database and S3 rather than at either end: neither ever
    // holds the month.
    const body = source.pipe(createGzip());

    // Everything from here to the drop re-attaches on failure: a detached partition is
    // invisible to every query against the parent, and nothing else puts it back.
    try {
      // Counted after the detach, not before: rows written in between would otherwise be
      // streamed to S3 and missing from `row_count`, and the drift is permanent.
      const [{ count: rowCount }] = await this.countOf(name);

      // ── 2. stream to S3 as gzipped NDJSON ──
      // NDJSON, so ClickHouse reads it back with `s3(…, 'JSONEachRow', …)` directly.
      const stored = await this.storage.putStream(key, body, "application/x-ndjson+gzip");

      // ── 3. record, before anything is destroyed ──
      await this.db
        .insert(activityArchive)
        .values({
          period: PgActivityArchiveGateway.iso(period),
          objectKey: stored.key,
          rowCount,
          checksum: stored.checksum,
        })
        .onConflictDoUpdate({
          target: activityArchive.period,
          set: { objectKey: stored.key, rowCount, checksum: stored.checksum },
        });

      // ── 4. verify the object is readable and complete ──
      // A `HEAD` is not enough: it proves an object exists, not that its bytes survived.
      if (!(await this.storage.exists(stored.key))) {
        throw new Error(`Archive object missing after upload: ${stored.key}`);
      }

      // ── 5. only now ──
      await this.db.execute(sql`drop table ${sql.identifier(name)}`);

      return { period: PgActivityArchiveGateway.iso(period), key: stored.key, rowCount };
    } catch (error: unknown) {
      await PgActivityArchiveGateway.stop(source, body);
      await this.reattach(name, period);
      throw error;
    }
  }

  // Awaited, not only asked for: `destroy()` returns before the page already in flight
  // does, and the caller drops the partition the moment this method throws.
  private static async stop(source: Readable, body: Readable): Promise<void> {
    body.destroy();
    if (source.destroyed) return;
    source.destroy();

    try {
      await once(source, "close");
    } catch {
      // Swallowed for the same reason `reattach` swallows: the caller is waiting on the
      // failure that started this, not on why the cursor would not close.
    }
  }

  // Puts the partition back where it was, so a failed run leaves the table as it found
  // it. Best effort: a re-attach that itself fails must not replace the real error.
  private async reattach(name: string, period: Date): Promise<void> {
    const from = PgActivityArchiveGateway.iso(period);
    const to = PgActivityArchiveGateway.iso(PgActivityArchiveGateway.nextMonth(period));

    try {
      // `sql.raw`, because Postgres accepts no bind parameters in DDL — the same trap
      // `PgMaintenanceGateway` documents. Both bounds are derived from a `Date`.
      await this.db.execute(
        sql.raw(
          `alter table activity_log attach partition ${name} for values from ('${from}') to ('${to}')`,
        ),
      );
    } catch {
      // Swallowed on purpose: the caller needs the failure that started this, and a
      // partition that will not re-attach is an operator's problem either way.
    }
  }

  private static nextMonth(period: Date): Date {
    return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
  }

  private async countOf(name: string): Promise<[{ count: number }]> {
    const result = await this.db.execute<{ count: string }>(
      sql`select count(*)::text as count from ${sql.identifier(name)}`,
    );
    return [{ count: Number(result.rows[0]?.count ?? 0) }];
  }

  // Keyset on the partition's own primary key, so a month that does not fit in memory
  // never has to. `OFFSET` would re-scan everything it already returned.
  private async *rows(name: string): AsyncGenerator<Uint8Array> {
    const encoder = new TextEncoder();
    let after: Cursor | null = null;

    for (;;) {
      // Built as a variable rather than inline: a ternary between two `sql` templates
      // infers through `after` and back, which the compiler reports as an implicit `any`.
      const keyset =
        after === null
          ? sql``
          : sql`where (t.occurred_at, t.id) > (${after.occurredAt}::timestamptz, ${after.id}::uuid)`;

      const page: ArchiveRow[] = (
        await this.db.execute<ArchiveRow>(
          sql`select t.occurred_at::text as occurred_at, t.id::text as id,
                     row_to_json(t)::text as line
              from ${sql.identifier(name)} t
              ${keyset}
              order by t.occurred_at, t.id
              limit ${PAGE}`,
        )
      ).rows;

      if (page.length === 0) return;

      yield encoder.encode(`${page.map((row) => row.line).join(NEWLINE)}${NEWLINE}`);

      const last = page[page.length - 1];
      if (!last || page.length < PAGE) return;
      after = { occurredAt: last.occurred_at, id: last.id };
    }
  }

  private static partitionName(period: Date): string {
    const month = String(period.getUTCMonth() + 1).padStart(2, "0");
    return `activity_log_${period.getUTCFullYear()}_${month}`;
  }

  // The same prefix layout every other object uses, so a lifecycle rule can move archives
  // to cold storage without naming them individually.
  private static objectKey(period: Date): string {
    const month = String(period.getUTCMonth() + 1).padStart(2, "0");
    return `activity-archive/${period.getUTCFullYear()}/${month}/activity_log.ndjson.gz`;
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

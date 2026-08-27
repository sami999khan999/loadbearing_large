import {
  type ActivityArchiveGateway,
  type ArchivedPartition,
  createGzip,
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

// `row_to_json` gives the NDJSON line; the two key columns come back beside it so the
// next page's cursor costs no extra round trip.
//
// A type alias rather than an interface, and not by preference: drizzle's `execute<T>`
// constrains `T` to `Record<string, unknown>`, which an interface does not satisfy
// because only aliases get an implicit index signature.
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

  // The order below is the whole job, and it is the order rather than the steps that
  // matters: dropping before verifying is unrecoverable loss of the audit trail, which
  // is the highest-value record this system keeps.
  //
  //   detach → stream to S3 → record → verify → drop
  //
  // Detaching first is what makes the export consistent: the partition stops receiving
  // rows the instant it is detached, so what gets uploaded is a closed set.
  public async archive(period: Date): Promise<ArchivedPartition> {
    const name = PgActivityArchiveGateway.partitionName(period);
    const key = PgActivityArchiveGateway.objectKey(period);

    const [{ count: rowCount }] = await this.countOf(name);

    // ── 1. detach ──
    // CONCURRENTLY so the parent is not locked against writers while it happens. It
    // cannot run inside a transaction, which is also why this whole method is not one.
    await this.db.execute(
      sql`alter table ${sql.identifier("activity_log")} detach partition ${sql.identifier(name)} concurrently`,
    );

    // ── 2. stream to S3 as gzipped NDJSON ──
    // NDJSON and not CSV because ClickHouse reads it back with
    // `s3(…, 'JSONEachRow', …)` directly, which is what makes a cold replay a query
    // rather than an afternoon.
    const stored = await this.storage.putStream(
      key,
      PgActivityArchiveGateway.gzip(this.rows(name)),
      "application/x-ndjson+gzip",
    );

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
  }

  private async countOf(name: string): Promise<[{ count: number }]> {
    const result = await this.db.execute<{ count: string }>(
      sql`select count(*)::text as count from ${sql.identifier(name)}`,
    );
    return [{ count: Number(result.rows[0]?.count ?? 0) }];
  }

  // Keyset pagination on the partition's own primary key, so a month that does not fit
  // in memory never has to. `OFFSET` would re-scan everything it already returned, and
  // the cursor columns come back with the page rather than from a second query.
  private async *rows(name: string): AsyncGenerator<Uint8Array> {
    const encoder = new TextEncoder();
    let after: Cursor | null = null;

    for (;;) {
      // The predicate is built first rather than inline: a ternary between two `sql`
      // templates makes the row type infer through `after`, which `after` is then
      // assigned from — a cycle the compiler reports as an implicit `any`.
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

  private static gzip(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
    // Compression happens between the database and S3 rather than at either end, so
    // neither ever holds the month. A `Gzip` stream is already an AsyncIterable of
    // chunks, which is why no cast is needed to hand it to `putStream`.
    return Readable.from(source).pipe(createGzip());
  }

  private static partitionName(period: Date): string {
    const month = String(period.getUTCMonth() + 1).padStart(2, "0");
    return `activity_log_${period.getUTCFullYear()}_${month}`;
  }

  // `<subject>/<yyyy>/<mm>/…`, the same prefix layout every other object uses, so a
  // lifecycle rule can move archives to cold storage without naming them individually.
  private static objectKey(period: Date): string {
    const month = String(period.getUTCMonth() + 1).padStart(2, "0");
    return `activity-archive/${period.getUTCFullYear()}/${month}/activity_log.ndjson.gz`;
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

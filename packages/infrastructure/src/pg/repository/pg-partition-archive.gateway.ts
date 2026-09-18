import {
  type ArchivedObject,
  type ArchivedPartition,
  Buffer,
  createGunzip,
  createGzip,
  InternalError,
  NotFoundError,
  type OrganizationId,
  once,
  type PartitionArchiveEntry,
  PartitionArchiveGateway,
  PartitionedTable,
  type PartitionedTableEntry,
  type PartitionedTableName,
  pipeline,
  Readable,
  type RestoredMonth,
  type StorageGateway,
  sql,
} from "../../import.js";
import type { Database } from "../primitive/index.js";
import { BaseRepository } from "../primitive/index.js";
import { partitionArchive } from "../schema/index.js";
import type { TransactionScope } from "../transaction/index.js";

// Rows per round trip out of the detached partition. Large enough that the cursor
// overhead disappears, small enough that one batch is a few megabytes of JSON.
const PAGE = 10_000;

// Rows per insert on the way back in. Smaller than `PAGE`: a restore hands Postgres one
// JSON parameter per batch, and the server parses the whole thing before it writes a row.
const RESTORE_BATCH = 5_000;

// NDJSON is newline-delimited by definition, so the separator is data rather than
// formatting — naming it keeps a formatter from ever treating it as the latter.
const NEWLINE = "\n";

// Postgres truncates an identifier past this, and a truncated scratch table collides
// silently with the next tenant's.
const MAX_IDENTIFIER = 63;

// An alias rather than an interface: drizzle's `execute<T>` constrains `T` to
// `Record<string, unknown>`, and only aliases get an implicit index signature.
type ArchiveRow = {
  sort_key: string;
  id: string;
  action: string | null;
  line: string;
};

type ChildRow = {
  parent: string;
  name: string;
};

// `bytes` comes back as text because it is a `bigint`: the driver would hand back a
// string anyway, and asking for one is what makes that explicit.
type EntryRow = {
  organization_id: string;
  table_name: string;
  period: string;
  object_key: string;
  row_count: number;
  bytes: string;
  checksum: string;
  action_counts: Record<string, number>;
  projected_at: string | null;
};

interface Cursor {
  readonly sortKey: string;
  readonly id: string;
}

// One tenant-month child and the tenant it belongs to. For a table with no tenant level
// the child is the month itself and the tenant is `NO_TENANT`.
interface Child {
  readonly parent: string;
  readonly name: string;
  readonly organizationId: OrganizationId;
}

export class PgPartitionArchiveGateway extends BaseRepository implements PartitionArchiveGateway {
  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly storage: StorageGateway,
  ) {
    super(database, scope);
  }

  // One table-month, one tenant-month child at a time. Each child runs the whole
  // sequence, so a tenant whose upload fails leaves every other tenant archived.
  public async archive(
    table: PartitionedTableName,
    period: Date,
    organizationId?: OrganizationId,
  ): Promise<ArchivedPartition> {
    const entry = PgPartitionArchiveGateway.monthly(table);
    const objects: ArchivedObject[] = [];
    const dropped: string[] = [];

    const children = (await this.childrenOf(entry, period)).filter(
      (child) => !organizationId || child.organizationId === organizationId,
    );

    for (const child of children) {
      const object = await this.archiveChild(table, entry, period, child);
      if (object) objects.push(object);
      dropped.push(child.name);
    }

    return { table, period: PgPartitionArchiveGateway.iso(period), objects, dropped };
  }

  // detach → stream to S3 → record → verify → drop. The order is the job: dropping
  // before verifying is unrecoverable. See docs/reference/cold-storage.md.
  private async archiveChild(
    table: PartitionedTableName,
    entry: PartitionedTableEntry,
    period: Date,
    child: Child,
  ): Promise<ArchivedObject | null> {
    // CONCURRENTLY so the parent is not locked against writers while it happens. It
    // cannot run inside a transaction, which is also why this whole method is not one.
    await this.db.execute(
      sql`alter table ${sql.identifier(child.parent)} detach partition ${sql.identifier(child.name)} concurrently`,
    );

    // Everything from here to the drop re-attaches on failure: a detached partition is
    // invisible to every query against the parent, and nothing else puts it back.
    try {
      // Counted after the detach, not before: rows written in between would otherwise be
      // streamed to S3 and missing from `row_count`, and the drift is permanent.
      const rowCount = await this.countOf(child.name);
      if (rowCount === 0) {
        // No object and no row. An absent `partition_archive` row means "nothing to
        // restore", never "not archived" — which is why an empty month writes none.
        await this.db.execute(sql`drop table ${sql.identifier(child.name)}`);
        return null;
      }

      return await this.uploadChild(table, entry, period, child, rowCount);
    } catch (error: unknown) {
      await this.reattach(child, period);
      throw error;
    }
  }

  // The middle three steps and the two streams they need stopped on the way out. Split
  // from the unwind above so an empty month never builds a stream at all.
  private async uploadChild(
    table: PartitionedTableName,
    entry: PartitionedTableEntry,
    period: Date,
    child: Child,
    rowCount: number,
  ): Promise<ArchivedObject> {
    const key = PgPartitionArchiveGateway.objectKey(table, period, child.organizationId);
    const actionCounts: Record<string, number> = {};

    // Built before the try so the failure path can stop them. `Readable.from` pulls as
    // soon as it is piped, and a rejected upload leaves it paging a partition nobody reads.
    const source = Readable.from(this.rows(entry, child.name, actionCounts));
    // Gzipped in between the database and S3 rather than at either end: neither ever
    // holds the month.
    const body = source.pipe(createGzip());

    try {
      // NDJSON, so ClickHouse reads it back with `s3(…, 'JSONEachRow', …)` directly.
      const stored = await this.storage.putStream(key, body, "application/x-ndjson+gzip");

      const object: ArchivedObject = {
        organizationId: child.organizationId,
        key: stored.key,
        rowCount,
        bytes: stored.size,
        checksum: stored.checksum,
        actionCounts,
      };

      // Recorded before anything is destroyed.
      await this.record(table, period, object);

      // A `HEAD` is not enough: it proves an object exists, not that its bytes survived.
      if (!(await this.storage.exists(stored.key))) {
        throw new Error(`Archive object missing after upload: ${stored.key}`);
      }

      await this.db.execute(sql`drop table ${sql.identifier(child.name)}`);

      return object;
    } catch (error: unknown) {
      await PgPartitionArchiveGateway.stop(source, body);
      throw error;
    }
  }

  private async record(
    table: PartitionedTableName,
    period: Date,
    object: ArchivedObject,
  ): Promise<void> {
    await this.db
      .insert(partitionArchive)
      .values({
        organizationId: object.organizationId,
        tableName: table,
        period: PgPartitionArchiveGateway.iso(period),
        objectKey: object.key,
        rowCount: object.rowCount,
        bytes: object.bytes,
        checksum: object.checksum,
        actionCounts: object.actionCounts,
      })
      .onConflictDoUpdate({
        target: [
          partitionArchive.organizationId,
          partitionArchive.tableName,
          partitionArchive.period,
        ],
        set: {
          objectKey: object.key,
          rowCount: object.rowCount,
          bytes: object.bytes,
          checksum: object.checksum,
          actionCounts: object.actionCounts,
        },
      });
  }

  // Into a scratch table, never the live parent: a re-attached month puts archived rows
  // back in the hot database and leaves the retention job arguing with itself.
  public async restore(
    table: PartitionedTableName,
    period: Date,
    organizationId: OrganizationId,
  ): Promise<RestoredMonth> {
    const entry = PgPartitionArchiveGateway.monthly(table);
    const iso = PgPartitionArchiveGateway.iso(period);
    const objectKey = await this.objectKeyOf(table, iso, organizationId);

    const child = PgPartitionArchiveGateway.childName(entry, period, organizationId);
    const scratch = PgPartitionArchiveGateway.scratchName(child);
    const body = await PgPartitionArchiveGateway.gunzip(await this.storage.get(objectKey));
    const lines = PgPartitionArchiveGateway.split(body.toString("utf8"));

    // Dropped rather than appended to: a previous restore of the same month is evidence
    // of that restore, and two runs merged into one table are evidence of neither.
    await this.db.execute(sql`drop table if exists ${sql.identifier(scratch)}`);
    await this.db.execute(sql.raw(`create table ${scratch} (like ${entry.name} including all)`));

    for (let at = 0; at < lines.length; at += RESTORE_BATCH) {
      const batch = lines.slice(at, at + RESTORE_BATCH);
      await this.db.execute(
        sql`insert into ${sql.identifier(scratch)}
            select * from json_populate_recordset(null::${sql.identifier(scratch)},
                                                  ${`[${batch.join(",")}]`}::json)`,
      );
    }

    return {
      table,
      period: iso,
      organizationId,
      scratchTable: scratch,
      rowCount: await this.countOf(scratch),
    };
  }

  // `where projected_at is null`, so a second run over the same month is a no-op rather
  // than a stamp that moves. The partial index is what makes the predicate free.
  public async markProjected(
    table: PartitionedTableName,
    period: Date,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db.execute(
      sql`update partition_archive set projected_at = now()
          where organization_id = ${organizationId}::uuid
            and table_name = ${table}
            and period = ${PgPartitionArchiveGateway.iso(period)}::date
            and projected_at is null`,
    );
  }

  // Objects first, rows second. A crash between the two leaves a row pointing at a
  // deleted object, which re-runs cleanly; the other order leaves an orphan forever.
  public async sweep(organizationId: OrganizationId): Promise<number> {
    const rows = await this.db.execute<{ object_key: string }>(
      sql`select object_key from partition_archive where organization_id = ${organizationId}::uuid`,
    );

    for (const row of rows.rows) await this.storage.delete(row.object_key);

    await this.db.execute(
      sql`delete from partition_archive where organization_id = ${organizationId}::uuid`,
    );

    return rows.rows.length;
  }

  // No `storage.delete()`, and that is the whole difference from `sweep`: the bucket
  // expired these objects itself, so deleting them again is a round trip per row.
  public async forget(table: PartitionedTableName, before: Date): Promise<number> {
    const result = await this.db.execute(
      sql`delete from partition_archive
          where table_name = ${table}
            and period < ${PgPartitionArchiveGateway.iso(before)}::date`,
    );

    return result.rowCount ?? 0;
  }

  // Ordered by tenant, so a restore of a whole month walks them in a stable order and
  // two runs log the same sequence.
  public async entriesFor(
    table: PartitionedTableName,
    period: string,
    organizationId?: OrganizationId,
  ): Promise<readonly PartitionArchiveEntry[]> {
    const tenant = organizationId ? sql`and organization_id = ${organizationId}::uuid` : sql``;

    const rows = await this.db.execute<EntryRow>(
      sql`select organization_id::text as organization_id, table_name, period::text as period,
                 object_key, row_count, bytes::bigint::text as bytes, checksum,
                 action_counts, projected_at
          from partition_archive
          where table_name = ${table} and period = ${period}::date ${tenant}
          order by organization_id`,
    );

    return rows.rows.map((row) => ({
      organizationId: row.organization_id as OrganizationId,
      tableName: table,
      period: row.period,
      objectKey: row.object_key,
      rowCount: Number(row.row_count),
      bytes: Number(row.bytes),
      checksum: row.checksum,
      actionCounts: row.action_counts,
      projectedAt: row.projected_at === null ? null : new Date(row.projected_at),
    }));
  }

  private async objectKeyOf(
    table: PartitionedTableName,
    period: string,
    organizationId: OrganizationId,
  ): Promise<string> {
    const rows = await this.db.execute<{ object_key: string }>(
      sql`select object_key from partition_archive
          where organization_id = ${organizationId}::uuid
            and table_name = ${table}
            and period = ${period}::date`,
    );

    const key = rows.rows[0]?.object_key;
    if (!key) throw new NotFoundError("cold", `${table}/${period}/${organizationId}`);

    return key;
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
  private async reattach(child: Child, period: Date): Promise<void> {
    const from = PgPartitionArchiveGateway.iso(period);
    const to = PgPartitionArchiveGateway.iso(PgPartitionArchiveGateway.nextMonth(period));

    try {
      // A cancelled `detach … concurrently` leaves the partition *detach-pending*: still a
      // child, so `attach` is not the inverse, and no row in the month can be read or written.
      if (await this.isDetachPending(child.name)) {
        await this.db.execute(
          sql.raw(`alter table ${child.parent} detach partition ${child.name} finalize`),
        );
      }

      // `sql.raw`, because Postgres accepts no bind parameters in DDL — the same trap
      // `PgMaintenanceGateway` documents. Both bounds are derived from a `Date`.
      await this.db.execute(
        sql.raw(
          `alter table ${child.parent} attach partition ${child.name} for values from ('${from}') to ('${to}')`,
        ),
      );
    } catch {
      // Swallowed on purpose: the caller needs the failure that started this, and a
      // partition that will not re-attach is an operator's problem either way.
    }
  }

  // `inhdetachpending` is the only thing that distinguishes a half-detached partition from
  // an attached one, and the difference is a month that silently accepts no writes.
  private async isDetachPending(name: string): Promise<boolean> {
    const result = await this.db.execute<{ pending: boolean }>(sql`
      select inhdetachpending as pending
      from pg_inherits
      where inhrelid = ${`public.${name}`}::regclass
    `);

    return result.rows[0]?.pending === true;
  }

  // From the catalog rather than from `organizations`: a partition whose tenant row is
  // already gone still holds rows, and this is the loop that has to find it.
  private async childrenOf(entry: PartitionedTableEntry, period: Date): Promise<readonly Child[]> {
    const suffix = `_${PgPartitionArchiveGateway.monthSuffix(period)}`;

    if (!entry.tenantKey) {
      const rows = await this.db.execute<ChildRow>(sql`
        select root.relname as parent, child.relname as name
        from pg_class root
        join pg_inherits mi on mi.inhparent = root.oid
        join pg_class child on child.oid = mi.inhrelid
        where root.relname = ${entry.name} and child.relname = root.relname || ${suffix}
      `);

      return rows.rows.map((row) => ({
        parent: row.parent,
        name: row.name,
        organizationId: PartitionArchiveGateway.NO_TENANT,
      }));
    }

    const rows = await this.db.execute<ChildRow>(sql`
      select tenant.relname as parent, child.relname as name
      from pg_class root
      join pg_inherits ti on ti.inhparent = root.oid
      join pg_class tenant on tenant.oid = ti.inhrelid
      join pg_inherits mi on mi.inhparent = tenant.oid
      join pg_class child on child.oid = mi.inhrelid
      where root.relname = ${entry.name} and child.relname = tenant.relname || ${suffix}
      order by tenant.relname
    `);

    return rows.rows.map((row) => ({
      parent: row.parent,
      name: row.name,
      organizationId: PgPartitionArchiveGateway.tenantOf(entry.name, row.parent),
    }));
  }

  private async countOf(name: string): Promise<number> {
    const result = await this.db.execute<{ count: string }>(
      sql`select count(*)::text as count from ${sql.identifier(name)}`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  // Keyset on the partition's own primary key, so a month that does not fit in memory
  // never has to. `OFFSET` would re-scan everything it already returned.
  private async *rows(
    entry: PartitionedTableEntry,
    name: string,
    actionCounts: Record<string, number>,
  ): AsyncGenerator<Uint8Array> {
    const encoder = new TextEncoder();
    const column = sql.identifier(entry.column ?? "");
    // Only `activity_log` has one, and the breakdown is what lets a cold reconciliation
    // subtract an excluded action without reading the object back.
    const action =
      entry.name === PartitionedTable.ACTIVITY_LOG
        ? sql`t.action::text as action`
        : sql`null::text as action`;
    let after: Cursor | null = null;

    for (;;) {
      // Built as a variable rather than inline: a ternary between two `sql` templates
      // infers through `after` and back, which the compiler reports as an implicit `any`.
      const keyset =
        after === null
          ? sql``
          : sql`where (t.${column}, t.id) > (${after.sortKey}::timestamptz, ${after.id}::uuid)`;

      const page: ArchiveRow[] = (
        await this.db.execute<ArchiveRow>(
          sql`select t.${column}::text as sort_key, t.id::text as id, ${action},
                     row_to_json(t)::text as line
              from ${sql.identifier(name)} t
              ${keyset}
              order by t.${column}, t.id
              limit ${PAGE}`,
        )
      ).rows;

      if (page.length === 0) return;

      for (const row of page) {
        if (row.action === null) continue;
        actionCounts[row.action] = (actionCounts[row.action] ?? 0) + 1;
      }

      yield encoder.encode(`${page.map((row) => row.line).join(NEWLINE)}${NEWLINE}`);

      const last = page[page.length - 1];
      if (!last || page.length < PAGE) return;
      after = { sortKey: last.sort_key, id: last.id };
    }
  }

  private static async gunzip(body: Uint8Array): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    const out = createGunzip();
    out.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    await pipeline(Readable.from([body]), out);
    return Buffer.concat(chunks);
  }

  // Split and not parsed: the batch is handed to Postgres as one JSON array, so the
  // lines never become objects in this process at all.
  private static split(text: string): readonly string[] {
    return text.split(NEWLINE).filter((line) => line.length > 0);
  }

  // Total over the allowlist rather than a cast: a table with no month level has no
  // partition this gateway could archive, and saying so beats a wrong `drop table`.
  private static monthly(table: PartitionedTableName): PartitionedTableEntry {
    const entry = PartitionedTable.byName(table);
    if (!entry.column) throw new InternalError(new Error(`${table} has no month level`));
    return entry;
  }

  // `<table>_<32hex>` back to a uuid. Read off the catalog name rather than passed in,
  // so a partition whose tenant row is gone still reports whose it was.
  private static tenantOf(table: string, parent: string): OrganizationId {
    const hex = parent.slice(table.length + 1);
    const match = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/.exec(hex);
    if (!match) throw new InternalError(new Error(`Not a tenant partition: ${parent}`));
    return match.slice(1).join("-") as OrganizationId;
  }

  private static childName(
    entry: PartitionedTableEntry,
    period: Date,
    organizationId: OrganizationId,
  ): string {
    const suffix = PgPartitionArchiveGateway.monthSuffix(period);
    if (!entry.tenantKey) return `${entry.name}_${suffix}`;

    const hex = organizationId.replaceAll("-", "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) {
      throw new InternalError(new Error(`Not an organization id: ${organizationId}`));
    }
    return `${entry.name}_${hex}_${suffix}`;
  }

  // The partition's own name plus a suffix, so what a scratch table holds is legible
  // from its name and two restores of different months never collide.
  private static scratchName(child: string): string {
    const name = `${child}_restore`;
    if (name.length > MAX_IDENTIFIER) {
      throw new InternalError(new Error(`Scratch table name too long: ${name}`));
    }
    return name;
  }

  private static nextMonth(period: Date): Date {
    return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
  }

  private static monthSuffix(period: Date): string {
    return `${period.getUTCFullYear()}_${String(period.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  // `cold/` rather than a per-table prefix: one S3 lifecycle rule on it tiers every
  // table without naming an object, which is why the layout is fixed at all.
  private static objectKey(table: string, period: Date, organizationId: OrganizationId): string {
    const month = String(period.getUTCMonth() + 1).padStart(2, "0");
    return `cold/${table}/${period.getUTCFullYear()}/${month}/${organizationId}.ndjson.gz`;
  }

  private static iso(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}

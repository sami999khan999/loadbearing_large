import {
  type OrganizationId,
  PartitionedTable,
  sql,
  type TableRowCount,
  TenantMoveGateway,
} from "../../import.js";
import type { DatabaseCluster } from "../primitive/index.js";
import { TenantPartitionSeed } from "../seed/index.js";
import type { ShardScope, TransactionScope } from "../transaction/index.js";

// Annotated at the call site as well, because `cursor` is assigned out of the page and
// the inference would otherwise be circular.
interface PageRow extends Record<string, unknown> {
  readonly id: string;
  readonly row: Record<string, unknown>;
}

interface PageResult {
  readonly rows: readonly PageRow[];
}

// Rows per statement. Large enough that a small tenant is one round trip each way,
// small enough that one page is a parameter Postgres will accept.
const PAGE = 500;

// The tenant's own rows, in the order a copy has to write them: a table is listed after
// the tables it references, so the sibling keys on the target are satisfied as it goes.
const TABLES: readonly string[] = [
  ...PartitionedTable.TENANT_PARTITIONED.map((entry) => entry.name),
  // Not tenant-partitioned, so no partition names it and the drop below is a delete.
  // Copied anyway: its months are the tenant's, and retention is what ends them.
  "outbox_event",
];

// **The one seam that addresses two nodes at once.** Not a `BaseRepository`: that reads
// tables of one placement on one node, which is exactly what a move is not.
export class PgTenantMoveGateway extends TenantMoveGateway {
  public constructor(
    private readonly cluster: DatabaseCluster,
    private readonly scope: TransactionScope,
    private readonly shards: ShardScope,
  ) {
    super();
  }

  // `atNode`, not the ambient placement: the seed resolves its own node off scope, and
  // the node this has to prepare is the one the tenant is going *to*.
  public override async prepare(organizationId: OrganizationId, node: number): Promise<void> {
    const seed = new TenantPartitionSeed(this.cluster, this.scope, this.shards);
    await this.shards.atNode(node, () => seed.run(organizationId));
  }

  // Page in, page out, keyed on `id`. Every one of these tables has one, and a keyset
  // is what makes a resumed copy read the next page rather than the same one.
  public override async copy(
    organizationId: OrganizationId,
    fromNode: number,
    toNode: number,
  ): Promise<readonly TableRowCount[]> {
    const source = this.cluster.at(fromNode).client;
    const target = this.cluster.at(toNode).client;
    const counts: TableRowCount[] = [];

    for (const table of TABLES) {
      let cursor: string | null = null;
      let rows = 0;

      for (;;) {
        // `to_jsonb(t)` rather than a column list: the copy is column-agnostic, so a
        // migration that adds one does not silently stop copying it.
        const page: PageResult = await source.execute<PageRow>(sql`
          select t.id::text as id, to_jsonb(t) as row
          from ${sql.raw(table)} t
          where t.organization_id = ${organizationId}
            ${cursor === null ? sql`` : sql`and t.id::text > ${cursor}`}
          order by t.id::text
          limit ${PAGE}
        `);

        if (page.rows.length === 0) break;

        // `do nothing`, so a retried move writes each row once. The target's rows are
        // left in place when a move is abandoned, and the next attempt walks over them.
        await target.execute(sql`
          insert into ${sql.raw(table)}
          select * from jsonb_populate_recordset(
            null::${sql.raw(table)},
            ${JSON.stringify(page.rows.map((entry: PageRow) => entry.row))}::jsonb
          )
          on conflict do nothing
        `);

        rows += page.rows.length;
        cursor = page.rows.at(-1)?.id ?? null;
        if (page.rows.length < PAGE) break;
      }

      counts.push({ table, rows });
    }

    return counts;
  }

  // Counted on the node rather than tallied by the copy: the question is what arrived,
  // and a copy reporting on itself cannot answer that.
  public override async counts(
    organizationId: OrganizationId,
    node: number,
  ): Promise<readonly TableRowCount[]> {
    const client = this.cluster.at(node).client;
    const counts: TableRowCount[] = [];

    for (const table of TABLES) {
      const found = await client.execute<{ rows: string }>(sql`
        select count(*)::text as rows from ${sql.raw(table)}
        where organization_id = ${organizationId}
      `);

      counts.push({ table, rows: Number(found.rows[0]?.rows ?? 0) });
    }

    return counts;
  }

  // Detach-then-drop for the partitioned seven, for the reason `dropTenantPartitions`
  // gives; a delete for `outbox_event`, which has no partition to detach.
  public override async dropOn(
    organizationId: OrganizationId,
    node: number,
  ): Promise<readonly string[]> {
    const client = this.cluster.at(node).client;
    const dropped: string[] = [];

    for (const entry of [...PartitionedTable.TENANT_PARTITIONED].reverse()) {
      const name = TenantPartitionSeed.partitionName(entry.name, organizationId);
      const probe = await client.execute<{ present: string | null }>(
        sql`select to_regclass(${`public.${name}`})::text as present`,
      );

      if (!probe.rows[0]?.present) continue;

      await client.execute(sql.raw(`alter table ${entry.name} detach partition ${name}`));
      await client.execute(sql.raw(`drop table ${name}`));
      dropped.push(name);
    }

    await client.execute(sql`delete from outbox_event where organization_id = ${organizationId}`);

    return dropped;
  }
}

import {
  type DomainEvent,
  type DomainEventName,
  type OutboxGateway,
  sql,
  type UnitOfWork,
} from "../../import.js";
import { BaseRepository, type Database } from "../primitive/index.js";
import type { TransactionScope } from "../transaction/index.js";

interface PendingRow extends Record<string, unknown> {
  readonly id: string;
  readonly organization_id: string;
  readonly actor_id: string;
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly occurred_at: Date;
}

export class PgOutboxGateway extends BaseRepository implements OutboxGateway {
  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly unitOfWork: UnitOfWork,
  ) {
    super(database, scope);
  }

  // Claim, relay, mark — in one transaction. `relay` is awaited *inside* it, so a throw
  // rolls the claim back and the same rows come round on the next tick.
  public async drain(
    limit: number,
    relay: (events: readonly DomainEvent[]) => Promise<void>,
  ): Promise<number> {
    return this.unitOfWork.run(async () => {
      // `SKIP LOCKED` is what lets two worker replicas share the drain with no
      // coordinator: each takes rows the other has not already locked.
      const claimed = await this.db.execute<PendingRow>(sql`
        select id, organization_id, actor_id, name, payload, occurred_at
        from outbox_event
        where published_at is null
        order by occurred_at, id
        limit ${limit}
        for update skip locked
      `);

      const events = claimed.rows.map((row) => PgOutboxGateway.toEvent(row));
      if (events.length === 0) return 0;

      await relay(events);

      // `published_at is null` again in the predicate, so a row another replica somehow
      // marked in between is left alone rather than re-stamped.
      await this.db.execute(sql`
        update outbox_event
        set published_at = now()
        where published_at is null
          and (id, occurred_at) in ${sql.raw(PgOutboxGateway.tuples(claimed.rows))}
      `);

      return events.length;
    });
  }

  public async oldestPendingAt(): Promise<Date | null> {
    const result = await this.db.execute<{ occurred_at: Date | null }>(sql`
      select min(occurred_at) as occurred_at from outbox_event where published_at is null
    `);

    return result.rows[0]?.occurred_at ?? null;
  }

  // Inlined because Postgres accepts no bind parameter for a row-constructor list of
  // unknown length. Every value is a uuid or a timestamp this process just read back.
  private static tuples(rows: readonly PendingRow[]): string {
    const values = rows
      .map((row) => `('${row.id}'::uuid, '${row.occurred_at.toISOString()}'::timestamptz)`)
      .join(", ");

    return `(${values})`;
  }

  private static toEvent(row: PendingRow): DomainEvent {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name as DomainEventName,
      actorId: row.actor_id,
      occurredAt: row.occurred_at,
      payload: row.payload,
    } as DomainEvent;
  }
}

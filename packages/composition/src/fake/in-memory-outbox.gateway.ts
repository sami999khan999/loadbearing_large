import { type DomainEvent, OutboxGateway, Uuid } from "../import.js";

// Honours the relay contract rather than approximating it: rows are removed only when
// `relay` resolves, so a spec can assert that a failing subscriber leaves work behind.
export class InMemoryOutboxGateway extends OutboxGateway {
  private readonly pending: DomainEvent[] = [];

  // The test-side counterpart of `PgOutboxPublisher`, so a spec can seed the outbox
  // without naming a table.
  public enqueue(event: Omit<DomainEvent, "id"> & { readonly id?: string }): void {
    this.pending.push({ ...event, id: event.id ?? Uuid.v7() });
  }

  public override async drain(
    limit: number,
    relay: (events: readonly DomainEvent[]) => Promise<void>,
  ): Promise<number> {
    const batch = this.pending.slice(0, limit);
    if (batch.length === 0) return 0;

    // Awaited before anything is removed. A throw here leaves every row claimed and
    // pending, which is what the transactional adapter does by rolling back.
    await relay(batch);
    this.pending.splice(0, batch.length);

    return batch.length;
  }

  public override oldestPendingAt(): Promise<Date | null> {
    const oldest = this.pending.reduce<Date | null>(
      (earliest, event) =>
        earliest === null || event.occurredAt < earliest ? event.occurredAt : earliest,
      null,
    );
    return Promise.resolve(oldest);
  }

  public remaining(): readonly DomainEvent[] {
    return this.pending;
  }
}

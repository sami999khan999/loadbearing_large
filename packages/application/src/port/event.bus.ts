export interface DomainEvent {
  // Stable identity, so a handler that runs twice can tell that it has.
  readonly id: string;
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

// Broker-shaped while dispatch is still in-process: async, returns nothing, no ordering
// guarantee, and no handler exception reaching the publisher. A broker cannot give those back.
export abstract class EventBus {
  public abstract publish(event: DomainEvent): Promise<void>;
}

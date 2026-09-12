import type { DomainEvent } from "../import.js";

// No principal on any method — platform work, like `MaintenanceGateway`. Reachable from
// the worker only: nothing on a request path drains an outbox.
export abstract class OutboxGateway {
  // `relay` is called with a claimed batch and the rows are marked published only if it
  // resolves. A throw rolls the claim back, and the same rows come round next tick.
  public abstract drain(
    limit: number,
    relay: (events: readonly DomainEvent[]) => Promise<void>,
  ): Promise<number>;

  // The lag probe. Null when nothing is pending, which is the healthy answer and not a
  // missing one — an alert keyed on this must treat the two differently.
  public abstract oldestPendingAt(): Promise<Date | null>;
}

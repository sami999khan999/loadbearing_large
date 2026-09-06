import { type DomainEvent, EventBus } from "../import.js";

// The one port with no production implementation, because nothing publishes a domain
// event yet. The fake makes the first one that does testable on the day it lands.
export class RecordingEventBus extends EventBus {
  private readonly events: DomainEvent[] = [];

  public override publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  public published(): readonly DomainEvent[] {
    return this.events;
  }

  public names(): readonly string[] {
    return this.events.map((event) => event.name);
  }
}

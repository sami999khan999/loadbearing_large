import type { RealtimeMessage } from "../import.js";
import type { CancellationSignal, RealtimeChannel } from "../primitive/index.js";

export interface SubscribeOptions {
  // Whose stream this is, for the per-person cap: the user channel of the principal that
  // opened it. Without it only user channels count, and conversation streams go uncapped.
  readonly owner?: RealtimeChannel;
}

// The stream ends when `signal` aborts or the maximum age elapses, and it never buffers
// history: what a reconnecting client missed is gone, so it refetches instead.
export abstract class RealtimeSubscriber {
  public abstract subscribe(
    channels: readonly RealtimeChannel[],
    signal: CancellationSignal,
    options?: SubscribeOptions,
  ): AsyncIterable<RealtimeMessage>;

  // Ends every open stream cleanly at a random point inside `withinMs` — a clean end is what
  // a client reopens from, so a shutdown hands its tabs on spread out. Resolves with the count.
  public abstract drain(withinMs: number): Promise<number>;
}

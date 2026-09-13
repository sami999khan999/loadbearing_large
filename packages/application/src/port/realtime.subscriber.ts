import type { RealtimeMessage } from "../import.js";
import type { CancellationSignal, RealtimeChannel } from "../primitive/index.js";

// The stream ends when `signal` aborts or the maximum age elapses, and it never buffers
// history: what a reconnecting client missed is gone, so it refetches instead.
export abstract class RealtimeSubscriber {
  public abstract subscribe(
    channels: readonly RealtimeChannel[],
    signal: CancellationSignal,
  ): AsyncIterable<RealtimeMessage>;
}

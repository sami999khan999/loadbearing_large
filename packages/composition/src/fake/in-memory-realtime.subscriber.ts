import {
  type CancellationSignal,
  type RealtimeChannel,
  type RealtimeMessage,
  RealtimeSubscriber,
} from "../import.js";
import type { InMemoryRealtimeHub } from "./in-memory-realtime.hub.js";

// Unbounded, unlike the Redis adapter. The bounded queue and its `resync` marker exist to
// keep one slow tab from costing memory, and a spec has neither a slow tab nor memory.
export class InMemoryRealtimeSubscriber extends RealtimeSubscriber {
  public constructor(private readonly hub: InMemoryRealtimeHub) {
    super();
  }

  public override async *subscribe(
    channels: readonly RealtimeChannel[],
    signal: CancellationSignal,
  ): AsyncIterable<RealtimeMessage> {
    const queue: RealtimeMessage[] = [];
    let wake: (() => void) | null = null;

    const push = (message: RealtimeMessage) => {
      queue.push(message);
      wake?.();
      wake = null;
    };
    // Waking on abort as well as on a frame is what stops the generator parking forever
    // on a channel that never publishes again.
    const onAbort = () => {
      wake?.();
      wake = null;
    };

    const releases = channels.map((channel) => this.hub.listen(channel, push));
    signal.addEventListener("abort", onAbort);

    try {
      while (!signal.aborted) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      for (const release of releases) release();
    }
  }
}

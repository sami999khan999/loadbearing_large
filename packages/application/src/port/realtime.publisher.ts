import type { RealtimeMessage } from "../import.js";
import type { RealtimeChannel } from "../primitive/index.js";

// Fire and forget, and it is not a queue: a frame published to a channel nobody is
// listening on is gone, which is why the client refetches rather than trusting a replay.
export abstract class RealtimePublisher {
  public abstract publish(channel: RealtimeChannel, message: RealtimeMessage): Promise<void>;
}

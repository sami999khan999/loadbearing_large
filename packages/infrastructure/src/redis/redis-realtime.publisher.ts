import type { RealtimeChannel, RealtimeMessage, RealtimePublisher, Redis } from "../import.js";

// On the cache client rather than the queue one: pub/sub is fire-and-forget, so the
// queue instance's durability guarantee buys nothing and its eviction policy is wasted.
export class RedisRealtimePublisher implements RealtimePublisher {
  public constructor(private readonly redis: Redis) {}

  // A frame published to a channel nobody is listening on is gone, and that is the
  // contract rather than a defect: the client refetches on reconnect.
  public async publish(channel: RealtimeChannel, message: RealtimeMessage): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(message));
  }
}

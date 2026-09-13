import type {
  Logger,
  RealtimeChannel,
  RealtimeMessage,
  RealtimePublisher,
  Redis,
} from "../import.js";
// On the cache client rather than the queue one: pub/sub is fire-and-forget, so the
// queue instance's durability guarantee buys nothing and its eviction policy is wasted.
export class RedisRealtimePublisher implements RealtimePublisher {
  public constructor(
    private readonly redis: Redis,
    private readonly logger?: Logger,
  ) {}

  // Best effort, and the swallow is here rather than at each call site: a frame is an
  // invalidation of something the client can fetch, so losing one costs a stale screen.
  public async publish(channel: RealtimeChannel, message: RealtimeMessage): Promise<void> {
    try {
      await this.redis.publish(channel, JSON.stringify(message));
    } catch {
      // The channel is per-person and would be a high-cardinality field on a line the
      // whole tenant produces. What matters is which event stopped arriving.
      this.logger?.emit("realtime.publish.failed", {
        event: message.kind === "event" ? message.name : message.kind,
      });
    }
  }
}

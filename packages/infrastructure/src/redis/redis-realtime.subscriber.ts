import {
  type CancellationSignal,
  RateLimitedError,
  type RealtimeChannel,
  RealtimeChannels,
  RealtimeContract,
  type RealtimeMessage,
  RealtimeSubscriber,
  type Redis,
  Uuid,
} from "../import.js";

export interface RedisRealtimeConfig {
  readonly maxStreamsPerUser: number;
  readonly maxAgeMs: number;
  readonly queueSize: number;
}

type Sink = (message: RealtimeMessage) => void;

// One connection per process, demultiplexed here. A connection per stream would open one
// socket per open tab, which is the number that takes a Redis down rather than a replica.
export class RedisRealtimeSubscriber extends RealtimeSubscriber {
  private readonly sinks = new Map<string, Set<Sink>>();
  private readonly streamsPerChannel = new Map<string, number>();
  private listening = false;

  public constructor(
    private readonly redis: Redis,
    private readonly config: RedisRealtimeConfig,
  ) {
    super();
  }

  public override async *subscribe(
    channels: readonly RealtimeChannel[],
    signal: CancellationSignal,
  ): AsyncIterable<RealtimeMessage> {
    const capped = channels.filter((channel) => RealtimeChannels.isUser(channel));
    this.assertUnderCap(capped);

    const queue: RealtimeMessage[] = [];
    let dropped = false;
    let wake: (() => void) | null = null;

    const push = (message: RealtimeMessage) => {
      // Oldest first, because the newest frame is the one the reader has not seen and the
      // `resync` that replaces the lost ones costs a refetch either way.
      if (queue.length >= this.config.queueSize) {
        queue.shift();
        dropped = true;
      }
      queue.push(message);
      wake?.();
      wake = null;
    };
    const onAbort = () => {
      wake?.();
      wake = null;
    };

    const deadline = Date.now() + this.config.maxAgeMs;
    signal.addEventListener("abort", onAbort);
    for (const channel of capped) this.count(channel, 1);

    try {
      await this.attach(channels, push);

      while (!signal.aborted && Date.now() < deadline) {
        if (dropped) {
          dropped = false;
          yield { kind: "resync", id: Uuid.v7() };
          continue;
        }

        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }

        await this.park(deadline, (resolve) => {
          wake = resolve;
        });
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      for (const channel of capped) this.count(channel, -1);
      await this.detach(channels, push);
    }
  }

  private assertUnderCap(channels: readonly RealtimeChannel[]): void {
    for (const channel of channels) {
      const open = this.streamsPerChannel.get(channel) ?? 0;
      // Per process, not per cluster. A cap that needed a shared counter would need a
      // round trip on every stream open, and the failure it prevents is one runaway tab.
      if (open >= this.config.maxStreamsPerUser) {
        throw new RateLimitedError("realtime.stream");
      }
    }
  }

  private count(channel: RealtimeChannel, delta: number): void {
    const next = (this.streamsPerChannel.get(channel) ?? 0) + delta;
    if (next <= 0) this.streamsPerChannel.delete(channel);
    else this.streamsPerChannel.set(channel, next);
  }

  // Resolves either when a frame arrives or when the stream's age runs out, so a channel
  // that never publishes again does not hold the generator open past its deadline.
  private park(deadline: number, register: (resolve: () => void) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
      register(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async attach(channels: readonly RealtimeChannel[], sink: Sink): Promise<void> {
    this.listen();

    for (const channel of channels) {
      const existing = this.sinks.get(channel);
      if (existing) {
        existing.add(sink);
        continue;
      }

      this.sinks.set(channel, new Set([sink]));
      await this.redis.subscribe(channel);
    }
  }

  // Ref-counted: the last reader off a channel is what releases it, and a channel left
  // subscribed is a frame delivered to nobody on every publish for the life of the process.
  private async detach(channels: readonly RealtimeChannel[], sink: Sink): Promise<void> {
    for (const channel of channels) {
      const existing = this.sinks.get(channel);
      if (!existing) continue;

      existing.delete(sink);
      if (existing.size > 0) continue;

      this.sinks.delete(channel);
      await this.redis.unsubscribe(channel);
    }
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;

    this.redis.on("message", (channel: string, payload: string) => {
      const sinks = this.sinks.get(channel);
      if (!sinks || sinks.size === 0) return;

      // Parsed, not cast. `at` crosses as a string and the contract coerces it, so a
      // reader handed the raw JSON would get a `Date`-typed value that is not one.
      const parsed = RealtimeContract.message.safeParse(this.decode(payload));
      if (!parsed.success) return;

      for (const sink of sinks) sink(parsed.data);
    });
  }

  private decode(payload: string): unknown {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
}

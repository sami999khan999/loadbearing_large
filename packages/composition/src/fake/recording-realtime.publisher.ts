import { type RealtimeChannel, type RealtimeMessage, RealtimePublisher } from "../import.js";

export interface PublishedFrame {
  readonly channel: string;
  readonly message: RealtimeMessage;
}

// Records rather than reaching Redis. The assertion worth writing is "the member's own
// channel got one frame", and the channel string is the whole of the tenancy claim.
export class RecordingRealtimePublisher extends RealtimePublisher {
  private readonly frames: PublishedFrame[] = [];

  public override publish(channel: RealtimeChannel, message: RealtimeMessage): Promise<void> {
    this.frames.push({ channel, message });
    return Promise.resolve();
  }

  public published(): readonly PublishedFrame[] {
    return this.frames;
  }

  public publishedOn(channel: string): readonly PublishedFrame[] {
    return this.frames.filter((frame) => frame.channel === channel);
  }
}

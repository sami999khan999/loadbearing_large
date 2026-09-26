import { RealtimeChannels, withEventMeta } from "../import.js";
import { authed } from "./base.js";

// Reconnect delay the client honours through `ClientRetryPlugin`, whose `retryDelay`
// default reads exactly this off the last frame.
const RETRY_MS = 2_000;

// Both streams, and nothing else. One namespace is one process: `apps/realtime` mounts this
// router and the browser sends every `realtime.*` path to it.
export class RealtimeRouter {
  private constructor() {}

  // The channel is built from the principal, never from input. That is the whole of the
  // authorisation: you cannot ask for a stream that is not yours.
  public static readonly stream = authed.realtime.stream.handler(async function* ({
    context,
    signal,
    lastEventId,
  }) {
    const channel = RealtimeChannels.user(
      context.principal.organizationId,
      context.principal.userId,
    );

    const startedAt = Date.now();
    let frames = 0;
    context.log.emit("realtime.stream.opened", { resumed: lastEventId !== undefined });

    try {
      // Pub/sub cannot replay, so a resume is a resync rather than a gap fill. Sent
      // before anything else, so the client refetches and then reads live frames.
      if (lastEventId !== undefined) {
        yield withEventMeta({ kind: "resync" as const, id: lastEventId }, { retry: RETRY_MS });
      }

      for await (const message of context.container.realtimeSubscriber.subscribe(
        [channel],
        // Non-null because oRPC supplies one for a streaming handler; the type is
        // optional because the same shape serves unary procedures.
        signal as AbortSignal,
        { owner: channel },
      )) {
        frames += 1;
        yield withEventMeta(message, { id: message.id, retry: RETRY_MS });
      }
    } finally {
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  // The second stream, and the only one that takes an input. Membership is asserted by
  // `getConversation` **before** the subscription, so a stranger never reaches Redis.
  public static readonly conversation = authed.realtime.conversation.handler(async function* ({
    input,
    context,
    signal,
    lastEventId,
  }) {
    await context.container.messaging.getConversation.execute(
      context.principal,
      input.conversationId,
    );

    const channel = RealtimeChannels.conversation(
      context.principal.organizationId,
      input.conversationId,
    );

    const startedAt = Date.now();
    let frames = 0;
    context.log.emit("realtime.stream.opened", { resumed: lastEventId !== undefined });

    try {
      if (lastEventId !== undefined) {
        yield withEventMeta({ kind: "resync" as const, id: lastEventId }, { retry: RETRY_MS });
      }

      for await (const message of context.container.realtimeSubscriber.subscribe(
        [channel],
        signal as AbortSignal,
        // The person's cap, not the room's: every stream a tab opens counts against it.
        {
          owner: RealtimeChannels.user(context.principal.organizationId, context.principal.userId),
        },
      )) {
        frames += 1;
        yield withEventMeta(message, { id: message.id, retry: RETRY_MS });
      }
    } finally {
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  public static readonly all = {
    stream: RealtimeRouter.stream,
    conversation: RealtimeRouter.conversation,
  };
}

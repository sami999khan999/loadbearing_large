import { ForbiddenError, RealtimeChannels, withEventMeta } from "../import.js";
import { authed } from "./base.js";
import { StreamRevalidation } from "./stream-revalidation.js";

// Reconnect delay the client honours through `ClientRetryPlugin`, whose `retryDelay`
// default reads exactly this off the last frame.
const RETRY_MS = 2_000;

// How often an open stream asks again whether its principal may still hold it. A minute
// of frames after a removal, where there were thirty (`CR.4`).
const REVALIDATE_MS = 60_000;

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
    // A deactivated member's stream ends; the reopen is refused, and the client stops.
    const watched = StreamRevalidation.watch(
      signal as AbortSignal,
      () =>
        context.container.memberships.isActive(
          context.principal.userId,
          context.principal.organizationId,
        ),
      REVALIDATE_MS,
    );

    try {
      // Pub/sub cannot replay, so a resume is a resync rather than a gap fill. Sent
      // before anything else, so the client refetches and then reads live frames.
      if (lastEventId !== undefined) {
        yield withEventMeta({ kind: "resync" as const, id: lastEventId }, { retry: RETRY_MS });
      }

      for await (const message of context.container.realtimeSubscriber.subscribe(
        [channel],
        watched.signal,
        { owner: channel },
      )) {
        frames += 1;
        yield withEventMeta(message, { id: message.id, retry: RETRY_MS });
      }
    } finally {
      watched.stop();
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  // The second stream, and the only one that takes an input. Membership is asserted
  // **before** the subscription, so a stranger never reaches Redis — and every minute after.
  public static readonly conversation = authed.realtime.conversation.handler(async function* ({
    input,
    context,
    signal,
    lastEventId,
  }) {
    await context.container.messaging.watch.execute(context.principal, input.conversationId);

    const channel = RealtimeChannels.conversation(
      context.principal.organizationId,
      input.conversationId,
    );

    const startedAt = Date.now();
    let frames = 0;
    context.log.emit("realtime.stream.opened", { resumed: lastEventId !== undefined });

    // Removed, left, or deactivated: the stream ends and the reopen is refused.
    const watched = StreamRevalidation.watch(
      signal as AbortSignal,
      async () => {
        try {
          await context.container.messaging.watch.execute(context.principal, input.conversationId);
          return true;
        } catch (error: unknown) {
          if (error instanceof ForbiddenError) return false;
          throw error;
        }
      },
      REVALIDATE_MS,
    );

    try {
      if (lastEventId !== undefined) {
        yield withEventMeta({ kind: "resync" as const, id: lastEventId }, { retry: RETRY_MS });
      }

      for await (const message of context.container.realtimeSubscriber.subscribe(
        [channel],
        watched.signal,
        // The person's cap, not the room's: every stream a tab opens counts against it.
        {
          owner: RealtimeChannels.user(context.principal.organizationId, context.principal.userId),
        },
      )) {
        frames += 1;
        yield withEventMeta(message, { id: message.id, retry: RETRY_MS });
      }
    } finally {
      watched.stop();
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  public static readonly all = {
    stream: RealtimeRouter.stream,
    conversation: RealtimeRouter.conversation,
  };
}

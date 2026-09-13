import { RealtimeChannels, withEventMeta } from "../import.js";
import { authed } from "./base.js";

const RETRY_MS = 2_000;

export class MessageRouter {
  private constructor() {}

  public static readonly list = authed.message.list.handler(({ input, context }) =>
    context.container.messaging.listMessages.execute(context.principal, input),
  );

  public static readonly send = authed.message.send.handler(({ input, context }) =>
    context.container.messaging.send.execute(context.principal, input),
  );

  public static readonly edit = authed.message.edit.handler(({ input, context }) =>
    context.container.messaging.edit.execute(context.principal, input),
  );

  public static readonly remove = authed.message.remove.handler(async ({ input, context }) => {
    await context.container.messaging.remove.execute(context.principal, input);
    return { ok: true as const };
  });

  public static readonly typing = authed.message.typing.handler(async ({ input, context }) => {
    await context.container.messaging.typing.execute(context.principal, input);
    return { ok: true as const };
  });

  // The second stream, and the only one that takes an input. Membership is asserted by
  // `getConversation` **before** the subscription, so a stranger never reaches Redis.
  public static readonly stream = authed.message.stream.handler(async function* ({
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
      )) {
        frames += 1;
        yield withEventMeta(message, { id: message.id, retry: RETRY_MS });
      }
    } finally {
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  public static readonly all = {
    list: MessageRouter.list,
    send: MessageRouter.send,
    edit: MessageRouter.edit,
    remove: MessageRouter.remove,
    typing: MessageRouter.typing,
    stream: MessageRouter.stream,
  };
}

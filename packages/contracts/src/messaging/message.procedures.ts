import { eventIterator, oc } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { RealtimeContract } from "../realtime/realtime.contract.js";
import { ConversationContract } from "./conversation.contract.js";
import { MessageContract } from "./message.contract.js";

export class MessageProcedures {
  private constructor() {}

  // Pages backwards from the newest, so the shape is `{ items, nextCursor }` read as
  // "older than this" rather than the forward keyset every other list uses.
  public static readonly list = oc
    .route({ method: "GET", path: "/messages" })
    .input(MessageContract.listQuery)
    .output(MessageContract.page);

  public static readonly send = oc
    .route({ method: "POST", path: "/messages" })
    .input(MessageContract.send)
    .output(MessageContract.entity);

  public static readonly edit = oc
    .route({ method: "PUT", path: "/messages/{messageId}" })
    .input(MessageContract.edit)
    .output(MessageContract.entity);

  public static readonly remove = oc
    .route({ method: "DELETE", path: "/messages/{messageId}" })
    .input(MessageContract.remove)
    .output(Envelope.acknowledged);

  public static readonly typing = oc
    .route({ method: "POST", path: "/messages/typing" })
    .input(MessageContract.typing)
    .output(Envelope.acknowledged);

  // The second stream. Opened only while a conversation is on screen, which is what
  // keeps a tab to two connections rather than one per conversation it has ever seen.
  public static readonly stream = oc
    .route({ method: "GET", path: "/messages/stream" })
    .input(ConversationContract.get)
    .output(eventIterator(RealtimeContract.message));

  public static readonly all = {
    list: MessageProcedures.list,
    send: MessageProcedures.send,
    edit: MessageProcedures.edit,
    remove: MessageProcedures.remove,
    typing: MessageProcedures.typing,
    stream: MessageProcedures.stream,
  } as const;
}

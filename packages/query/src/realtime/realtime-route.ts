import type { QueryClient, RealtimeEventName } from "../import.js";
import { QueryKeys } from "../key/index.js";

// Total over the event name union, so a name added to the contract is a compile error
// here rather than a frame that arrives and does nothing.
type RouteTable = Readonly<Record<RealtimeEventName, (queryClient: QueryClient) => void>>;

export class RealtimeRoutes {
  private constructor() {}

  // Invalidate, never patch. A frame says *what changed*, not what it changed to, and a
  // cache edit from a payload is a second copy of the server's shaping rules.
  private static readonly TABLE: RouteTable = Object.freeze({
    "member.changed": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.member.all() });
    },
    "notification.created": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.notification.all() });
    },
    // The user-stream frames. A conversation's own frames ride the conversation channel
    // and are handled by the component that opened it, not by this table.
    "conversation.changed": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.conversation.all() });
    },
    "conversation.read": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.conversation.all() });
    },
    "message.sent": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.message.all() });
    },
    "message.edited": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.message.all() });
    },
    "message.deleted": (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: QueryKeys.message.all() });
    },
  });

  public static apply(queryClient: QueryClient, name: RealtimeEventName): void {
    RealtimeRoutes.TABLE[name](queryClient);
  }

  // What a `resync` invalidates: every key the table names, because the gap could have
  // held any of them. Derived from the table rather than listed twice.
  public static resync(queryClient: QueryClient): void {
    for (const route of Object.values(RealtimeRoutes.TABLE)) route(queryClient);
  }

  public static names(): readonly RealtimeEventName[] {
    return Object.keys(RealtimeRoutes.TABLE) as readonly RealtimeEventName[];
  }
}

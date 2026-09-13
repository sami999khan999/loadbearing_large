import type { ApiClient, ListConversationsInput } from "../import.js";
import { infiniteQueryOptions, queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

type ConversationPage = Awaited<ReturnType<ApiClient["conversation"]["list"]>>;
type MessagePage = Awaited<ReturnType<ApiClient["message"]["list"]>>;

export class MessagingQueries {
  private constructor() {}

  public static conversations(client: ApiClient, params: Omit<ListConversationsInput, "cursor">) {
    return infiniteQueryOptions({
      queryKey: QueryKeys.conversation.list(params),
      queryFn: ({ pageParam }) =>
        client.conversation.list({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last: ConversationPage) => last.nextCursor ?? undefined,
      staleTime: 30_000,
    });
  }

  public static conversation(client: ApiClient, conversationId: string) {
    return queryOptions({
      queryKey: QueryKeys.conversation.get(conversationId),
      queryFn: () => client.conversation.get({ conversationId }),
      staleTime: 30_000,
    });
  }

  // Backwards from the newest, so the page param is named for the direction it goes.
  // `olderCursor` null is the start of the conversation, not an empty page.
  public static messages(client: ApiClient, conversationId: string) {
    return infiniteQueryOptions({
      queryKey: QueryKeys.message.list(conversationId),
      queryFn: ({ pageParam }) =>
        client.message.list({ conversationId, ...(pageParam ? { before: pageParam } : {}) }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last: MessagePage) => last.olderCursor ?? undefined,
      // Zero, because the stream is what keeps this fresh. A stale time here would let a
      // remount show a conversation that is behind the one the tab was just watching.
      staleTime: 0,
    });
  }
}

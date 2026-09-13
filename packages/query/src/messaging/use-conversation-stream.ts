import { type ApiClient, useEffect, useQueryClient, useRef, useState } from "../import.js";
import { QueryKeys } from "../key/index.js";

// A signal is published at most every two seconds, so a little over that is how long one
// stays true before the person is taken to have stopped.
const TYPING_EXPIRY_MS = 4_000;
const SWEEP_MS = 1_000;

export interface ConversationStreamState {
  readonly connected: boolean;
  // Keyed by user with an expiry, not a boolean: two people typing and one stopping has
  // to clear one name, and a boolean cannot say which.
  readonly typing: readonly string[];
}

// The **second** stream, and the only one with an input. Opened while a conversation is
// on screen and closed when it leaves, which is what keeps a tab to two connections.
export function useConversationStream(
  client: ApiClient,
  conversationId: string,
): ConversationStreamState {
  const queryClient = useQueryClient();
  const cache = useRef(queryClient);
  cache.current = queryClient;

  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<ReadonlyMap<string, number>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      const stream = await client.message.stream(
        { conversationId },
        { signal: controller.signal, context: { retry: Number.POSITIVE_INFINITY } },
      );

      setConnected(true);

      for await (const frame of stream) {
        if (cancelled) break;

        if (frame.kind === "typing") {
          const expiresAt = Date.now() + TYPING_EXPIRY_MS;
          setTyping((current) => new Map(current).set(frame.userId, expiresAt));
          continue;
        }

        // Everything else is a refetch. The frame says a message changed, never what it
        // changed to — patching a page from a payload is a copy of the server's shaping.
        void cache.current.invalidateQueries({
          queryKey: QueryKeys.message.list(conversationId),
        });
      }
    };

    run()
      .catch(() => {
        // The retry plugin owns reconnection. Reaching here means it gave up or the
        // component unmounted, and neither is an error to render.
      })
      .finally(() => {
        if (!cancelled) setConnected(false);
      });

    return () => {
      cancelled = true;
      setConnected(false);
      setTyping(new Map());
      controller.abort();
    };
  }, [client, conversationId]);

  // Swept on a timer rather than per frame: nothing publishes a "stopped typing", so
  // expiry is the only thing that clears a name.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((current) => {
        const live = [...current].filter(([, expiresAt]) => expiresAt > now);
        return live.length === current.size ? current : new Map(live);
      });
    }, SWEEP_MS);

    return () => clearInterval(timer);
  }, []);

  return { connected, typing: [...typing.keys()] };
}

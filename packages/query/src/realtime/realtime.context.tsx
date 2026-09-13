import {
  type ApiClient,
  createContext,
  type ReactNode,
  type RealtimeMessage,
  useContext,
  useEffect,
  useQueryClient,
  useRef,
  useState,
} from "../import.js";
import { RealtimeRoutes } from "./realtime-route.js";

export interface RealtimeState {
  readonly connected: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ connected: false });

type Listener = (message: RealtimeMessage) => void;
const listeners = new Set<Listener>();

export interface RealtimeProviderProps {
  readonly client: ApiClient;
  readonly children: ReactNode;
}

// One stream per tab, opened here rather than per component. On HTTP/1.1 a browser holds
// six connections to an origin, and each open stream is one of them.
export function RealtimeProvider({ client, children }: RealtimeProviderProps): ReactNode {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Read inside the effect rather than listed as a dependency: a new `QueryClient`
  // identity on a re-render would tear the stream down and open another.
  const cache = useRef(queryClient);
  cache.current = queryClient;

  useEffect(() => {
    // No `window` is SSR. Opening a stream there would hold a server-side request open
    // for the life of a render that has already finished.
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      // Infinite retries, opted in here. The plugin's default is 0, which is what keeps
      // every ordinary call from retrying itself.
      const stream = await client.realtime.stream(undefined, {
        signal: controller.signal,
        context: { retry: Number.POSITIVE_INFINITY },
      });

      setConnected(true);

      for await (const message of stream) {
        if (cancelled) break;
        // A resync means frames were lost, so everything the table names is suspect.
        if (message.kind === "resync") RealtimeRoutes.resync(cache.current);
        else RealtimeRoutes.apply(cache.current, message.name);

        for (const listener of listeners) listener(message);
      }
    };

    run()
      .catch(() => {
        // The retry plugin owns reconnection. Reaching here means it gave up or the
        // component unmounted, and neither is something to surface as an error state.
      })
      .finally(() => {
        if (!cancelled) setConnected(false);
      });

    return () => {
      cancelled = true;
      setConnected(false);
      controller.abort();
    };
  }, [client]);

  return <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

export function subscribeToFrames(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

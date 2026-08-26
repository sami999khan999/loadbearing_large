import {
  type ClientNamespace,
  createContext,
  type MessageParams,
  type MessageStore,
  type NamespaceKeys,
  type ReactNode,
  type ShellNamespace,
  type Translator,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "../import.js";

const MessageContext = createContext<Translator | null>(null);

// Keys a component may use: its own namespace, plus the always-loaded shell. The shell
// is in the union because every `ContentSource` puts `common` and `error` in every
// snapshot (20) — the type says exactly what the runtime guarantees.
type ScopedKey<N extends ClientNamespace> = NamespaceKeys[N] | NamespaceKeys[ShellNamespace];

export interface MessageProviderProps {
  readonly messages: MessageStore;
  readonly children: ReactNode;
}

// The React binding for `content`'s `Translator`. It lives here rather than in `content`
// because that package has to stay React-free for the worker.
export function MessageProvider({ messages, children }: MessageProviderProps) {
  const subscribe = useCallback((onChange: () => void) => messages.subscribe(onChange), [messages]);
  const read = useCallback(() => messages.translator, [messages]);
  // Subscribed once, here. `useMessages` stays a plain context read. `MessageStore`
  // returns a stable translator identity until `ensure()` genuinely adds something —
  // a new object per call would re-render forever.
  const translator = useSyncExternalStore(subscribe, read, read);

  return <MessageContext.Provider value={translator}>{children}</MessageContext.Provider>;
}

// `N` is inferred from one argument position, before any key is written, which is what
// makes the constraint real. A two-argument `t(ns, key)` shape does not narrow: the key
// position is also an inference site, so `N` widens until both arguments fit.
export function useMessages<N extends ClientNamespace>(namespace: N) {
  const translator = useContext(MessageContext);
  if (!translator) throw new Error("useMessages must be used inside a MessageProvider.");

  const t = useCallback(
    (key: ScopedKey<N>, params?: MessageParams) => translator.t(key, params),
    [translator],
  );

  return { t, locale: translator.locale, namespace };
}

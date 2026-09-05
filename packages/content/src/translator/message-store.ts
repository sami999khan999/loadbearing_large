import type { Namespace } from "../message/index.js";
import type { Locale } from "../primitive/index.js";
import type { ContentSource } from "../source/index.js";
import { type MessageSnapshot, Translator } from "./translator.js";

// The mutable holder around an immutable snapshot, because navigation adds namespaces
// after render. React-free, so it works in every process.
export class MessageStore {
  private snapshot: MessageSnapshot;
  private cached: Translator;
  private readonly listeners = new Set<() => void>();

  // A factory rather than a constant, because a snapshot carries its locale — and
  // `namespaces: []` is what makes `ensure()` fetch what the first navigation asks for.
  public static empty(locale: Locale): MessageSnapshot {
    return { locale, namespaces: [], base: {}, overrides: {} };
  }

  public constructor(
    private readonly content: ContentSource,
    initial: MessageSnapshot,
  ) {
    this.snapshot = initial;
    this.cached = new Translator(initial);
  }

  // Stable identity until `ensure()` adds something: `useSyncExternalStore` re-renders
  // forever if its read function returns a new object every call.
  public get translator(): Translator {
    return this.cached;
  }

  public dehydrate(): MessageSnapshot {
    return this.snapshot;
  }

  public restore(snapshot: MessageSnapshot): void {
    this.snapshot = snapshot;
    this.cached = new Translator(snapshot);
  }

  // Idempotent, and resolves immediately when nothing is missing — which is the common
  // case on a navigation between two routes that declare the same namespaces.
  public async ensure(namespaces: readonly Namespace[]): Promise<void> {
    const missing = namespaces.filter((name) => !this.snapshot.namespaces.includes(name));
    if (missing.length === 0) return;

    const added = await this.content.messages(this.snapshot.locale, missing);
    this.restore(Translator.merge(this.snapshot, added));
    for (const listener of this.listeners) listener();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

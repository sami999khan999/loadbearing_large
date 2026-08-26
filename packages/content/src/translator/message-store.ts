import type { Namespace } from "../message/index.js";
import type { ContentSource } from "../source/index.js";
import { type MessageSnapshot, Translator } from "./translator.js";

// A snapshot is immutable, but client-side navigation adds namespaces after the page has
// rendered. This is the mutable holder around it — React-free, so the same class works in
// `apps/web`'s SSR pass, in `apps/desktop`, in `apps/worker`, and in a Node test.
export class MessageStore {
  private snapshot: MessageSnapshot;
  private cached: Translator;
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly content: ContentSource,
    initial: MessageSnapshot,
  ) {
    this.snapshot = initial;
    this.cached = new Translator(initial);
  }

  // Identity is stable until `ensure()` actually adds something. That is not an
  // optimisation: `useSyncExternalStore` (23) re-renders forever if its read function
  // returns a new object on every call.
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

import type {
  ApiClient,
  CapabilitySetDto,
  MessageStore,
  QueryClient,
  SessionUser,
} from "~/import.js";
import type { AppearanceSnapshot, AppearanceStore } from "~/store/appearance.store.js";
import type { SessionStore } from "~/store/session.store.js";

// What every route sees. Built per request in `router.tsx`, never at module scope.
export interface RouterContext {
  readonly messages: MessageStore;
  readonly queryClient: QueryClient;
  readonly api: ApiClient;
  // The store the root route resolves into. Routes read the two fields below; this is
  // here so `__root.tsx`'s `beforeLoad` can ask whether the answer already rode in on
  // the SSR payload, and so a sign-in has something to invalidate.
  readonly session: SessionStore;
  // Same shape as `session`, same reason: resolved once on the server so the first
  // painted byte already carries the palette rather than correcting itself.
  readonly appearance: AppearanceStore;
  // The two fields `RouteGuard` reads. `router.tsx` seeds them signed-out and the root
  // route's `beforeLoad` replaces them for every route beneath it — so a guard that
  // somehow ran before the root resolved denies, which is the direction to fail in.
  //
  // The DTO rather than a `CapabilitySet`, and not by preference: TanStack Router
  // dehydrates a `beforeLoad` return value into the SSR payload and rejects anything
  // carrying a method at the type level. Reconstructing it in the guard is the same
  // round trip `SessionProvider` already does, and `can()` stays the one decision.
  readonly user: SessionUser | null;
  readonly capabilities: CapabilitySetDto;
  // What `__root.tsx` writes onto <html>. A plain object, not the store: TanStack Router
  // dehydrates a `beforeLoad` return value and rejects anything carrying a method.
  readonly appearanceSnapshot: AppearanceSnapshot;
}

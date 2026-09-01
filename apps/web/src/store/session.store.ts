import { CapabilitySet, type CapabilitySetDto, type SessionUser } from "~/import.js";

// What crosses the SSR boundary: the display fields the shell renders, and the
// capability set as JSON. The DTO rather than the class, for the same reason
// `SessionProvider` takes one — this is the round-trip property `permissions` exists
// for, and `can()` on the client has to be the same `can()` the server ran.
export interface SessionSnapshot {
  readonly user: SessionUser | null;
  readonly capabilities: CapabilitySetDto;
  // Whether this deployment configured Google. Not about the user at all, and it rides
  // here anyway: `Env` is server-only and this is the one payload the root route
  // already awaits on every request, so the alternative is a second server function
  // and a second round trip to answer a boolean that never changes.
  readonly googleEnabled: boolean;
}

// Signed out, denying everything. There is no loading state that grants access (23),
// so the *initial* value is the safe one and resolution only ever widens it.
const ANONYMOUS: SessionSnapshot = {
  user: null,
  capabilities: CapabilitySet.empty().toJSON(),
  // Off until the server says otherwise, so a store that has not resolved renders no
  // button rather than one that leads nowhere.
  googleEnabled: false,
};

// The session half of the per-request state, shaped exactly like `MessageStore` and for
// exactly the same reason: resolve on the server, ride the SSR payload, be complete
// before the first client render. Fetching it client-side instead makes every gated
// element flash — which is the failure `__root.tsx` predicted in a comment for several
// commits before this existed.
//
// One per request on the server and one per tab in the browser. Never at module scope in
// a server bundle: that is a session shared across concurrent requests, which under this
// permission model is a cross-tenant leak rather than a caching bug (21).
export class SessionStore {
  private snapshot: SessionSnapshot = ANONYMOUS;
  // Distinct from "the user is anonymous". An unresolved store has not asked yet; a
  // resolved one has, and the answer may legitimately be nobody.
  private resolved = false;
  private inFlight: Promise<void> | undefined;

  // Idempotent, and deliberately not a fetch-per-navigation. `restore()` marks the store
  // resolved before the first client render, so the hydration pass and every navigation
  // after it are a no-op — the round trip happens once, during SSR.
  public async ensure(load: () => Promise<SessionSnapshot>): Promise<void> {
    if (this.resolved) return;
    // Concurrent matches share one request rather than racing two.
    this.inFlight ??= load()
      .then((snapshot) => {
        this.snapshot = snapshot;
        this.resolved = true;
      })
      .finally(() => {
        this.inFlight = undefined;
      });

    return this.inFlight;
  }

  // After a sign-in, a sign-out, or anything that changes what the user may do. The next
  // `ensure()` asks again; until it answers, the store keeps its current answer rather
  // than flashing anonymous.
  public invalidate(): void {
    this.resolved = false;
  }

  public get user(): SessionUser | null {
    return this.snapshot.user;
  }

  // The DTO, never a reconstructed `CapabilitySet`: this value goes onto the router
  // context, and TanStack Router dehydrates that into the SSR payload — a class with
  // methods on it is rejected there at the type level.
  public get dto(): CapabilitySetDto {
    return this.snapshot.capabilities;
  }

  public get googleEnabled(): boolean {
    return this.snapshot.googleEnabled;
  }

  public dehydrate(): SessionSnapshot {
    return this.snapshot;
  }

  public restore(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    this.resolved = true;
  }
}

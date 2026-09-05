import {
  CapabilitySet,
  type CapabilitySetDto,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "../import.js";

// One tenant the signed-in person may switch to, as the switcher renders it.
export interface SessionOrganization {
  readonly id: string;
  readonly name: string;
}

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  // Both ride the SSR snapshot, so the switcher is right on the first painted byte
  // rather than after a second round trip.
  readonly activeOrganizationId: string;
  readonly organizations: readonly SessionOrganization[];
}

interface SessionValue {
  readonly user: SessionUser | null;
  readonly capabilities: CapabilitySet;
}

const SessionContext = createContext<SessionValue | null>(null);

export interface SessionProviderProps {
  readonly user: SessionUser | null;
  // The DTO, not the class: this crosses the SSR boundary as JSON, and reconstructing it
  // is what makes client `can()` the same `can()` the server ran.
  readonly capabilities: CapabilitySetDto;
  readonly children: ReactNode;
}

export function SessionProvider({ user, capabilities, children }: SessionProviderProps) {
  // Memoised so a re-render does not rebuild the internal Sets and invalidate every
  // downstream memo.
  const value = useMemo<SessionValue>(
    () => ({ user, capabilities: CapabilitySet.from(capabilities) }),
    [user, capabilities],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a SessionProvider.");
  return value;
}

export function useCapabilities(): CapabilitySet {
  return useSession().capabilities;
}

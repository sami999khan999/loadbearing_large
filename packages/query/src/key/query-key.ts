// Every key mirrors its procedure path, parameters last — a paged key that omits them
// serves page 1 for every page. See docs/reference/mutations.md.
export class QueryKeys {
  private constructor() {}

  // `{ all() }` like every namespace below, so a call site reads the same everywhere and
  // adding a key under `session` needs no change at the four places that invalidate it.
  public static readonly session = {
    all: () => ["session"] as const,
  };

  // `all()` on every namespace, because TanStack matches by prefix — one call catches
  // every list and detail below it, and that is what makes invalidation trustworthy.

  // Not under `session`: these outlive a single session record, and nesting them would
  // refetch three lists every time a session is refreshed.
  public static readonly account = {
    all: () => ["account"] as const,
    accounts: () => ["account", "linked", "list"] as const,
    sessions: () => ["account", "session", "list"] as const,
  };

  public static readonly rbac = {
    all: () => ["rbac"] as const,
    roles: (params: unknown) => ["rbac", "role", "list", params] as const,
    effective: (userId: string) => ["rbac", "effective", userId] as const,
  };

  // Inviting and revoking both invalidate `all()`: an invitation becoming a membership
  // changes both lists at once.
  public static readonly member = {
    all: () => ["member"] as const,
    list: (params: unknown) => ["member", "list", params] as const,
    invitations: (params: unknown) => ["member", "invitation", "list", params] as const,
  };
}

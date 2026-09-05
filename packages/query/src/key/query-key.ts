// Every key mirrors its procedure path, parameters last: `contract.task.list` becomes
// `["task", "list", params]`. See docs/reference/mutations.md.
export class QueryKeys {
  private constructor() {}

  public static readonly session = ["session"] as const;

  // `all()` on every namespace, because TanStack matches by prefix — one call catches
  // every list and detail below it, and that is what makes invalidation trustworthy.

  // Not under `session`: these outlive a single session record, and nesting them would
  // refetch three lists every time a session is refreshed.
  public static readonly account = {
    all: () => ["account"] as const,
    twoFactor: () => ["account", "two-factor"] as const,
    accounts: () => ["account", "linked", "list"] as const,
    sessions: () => ["account", "session", "list"] as const,
  };

  public static readonly rbac = {
    all: () => ["rbac"] as const,
    roles: () => ["rbac", "role", "list"] as const,
    effective: (userId: string) => ["rbac", "effective", userId] as const,
  };

  // Inviting and revoking both invalidate `all()`: an invitation becoming a membership
  // changes both lists at once.
  public static readonly member = {
    all: () => ["member"] as const,
    list: () => ["member", "list"] as const,
    invitations: () => ["member", "invitation", "list"] as const,
  };
}

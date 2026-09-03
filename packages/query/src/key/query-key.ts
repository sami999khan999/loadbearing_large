// Every key mirrors its procedure path, with parameters last: `contract.task.list`
// becomes `["task", "list", params]`. Given a procedure you can write its key without
// looking anything up, which is the same derivability the file-naming rules have.
export class QueryKeys {
  private constructor() {}

  public static readonly session = ["session"] as const;

  // `all()` on every namespace, because TanStack matches by prefix — one call catches
  // every list and detail below it, and that is what makes invalidation trustworthy.

  // The signed-in person's own account. Not under `session`, because these outlive a
  // single session record — the linked-account list is a property of the user, and
  // invalidating it every time a session is refreshed would refetch three lists a minute.
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

  // The members page. Inviting and revoking both invalidate `all()` — an invitation
  // becoming a membership changes both lists at once.
  public static readonly member = {
    all: () => ["member"] as const,
    list: () => ["member", "list"] as const,
    invitations: () => ["member", "invitation", "list"] as const,
  };
}

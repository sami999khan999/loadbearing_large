// Every key mirrors its procedure path, with parameters last: `contract.task.list`
// becomes `["task", "list", params]`. Given a procedure you can write its key without
// looking anything up, which is the same derivability the file-naming rules have.
export class QueryKeys {
  private constructor() {}

  public static readonly session = ["session"] as const;

  // `all()` on every namespace, because TanStack matches by prefix — one call catches
  // every list and detail below it, and that is what makes invalidation trustworthy.
  public static readonly rbac = {
    all: () => ["rbac"] as const,
    roles: () => ["rbac", "role", "list"] as const,
    effective: (userId: string) => ["rbac", "effective", userId] as const,
  };
}

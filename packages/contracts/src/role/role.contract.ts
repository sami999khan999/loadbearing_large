import { z } from "../import.js";
import { Identifiers, Pagination } from "../primitive/index.js";

export class RoleContract {
  private constructor() {}

  // `org` or `goal`, mirroring `roles.scope`. An org-scoped role's grants apply
  // everywhere in the tenant; a goal-scoped one applies only inside the goals a
  // membership names.
  public static readonly scope = z.enum(["org", "goal"]);

  public static readonly entity = z.object({
    id: Identifiers.roleId,
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    scope: RoleContract.scope,
    // Seeded by `SystemRoleSeed` and re-seeded on every deploy. Surfaced because a UI
    // that lets someone edit `owner` is a UI that lets someone lock themselves out.
    isSystem: z.boolean(),
    // Raw permission strings, exactly as `role_permissions` stores them — the same
    // decision that table's own comment records. A key the catalog no longer knows is
    // filtered by `PermissionRegistry.isKnown()` at the point of use, not here: a
    // renamed permission must not make this endpoint throw.
    permissions: z.array(z.string()).readonly(),
  });

  public static readonly listQuery = Pagination.query;
}

export type RoleDto = z.infer<typeof RoleContract.entity>;

import {
  and,
  eq,
  inArray,
  type OrganizationId,
  type PermissionKey,
  PermissionRegistry,
  Uuid,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { rolePermissions, roles } from "../schema/index.js";

interface SystemRole {
  readonly key: string;
  readonly name: string;
  readonly scope: "org" | "goal";
  readonly permissions: readonly PermissionKey[] | "all";
}

// Only `owner` is a wildcard: a role granting "everything in module X" keeps granting new
// things as X grows, which is how a reviewer acquires write access.

// Frozen at module load rather than left a `static readonly`, which freezes the binding
// and not the array — the shape `docs/ai/rules/classes.md` bans.
const ROLES: readonly SystemRole[] = Object.freeze([
  { key: "owner", name: "Owner", scope: "org", permissions: "all" },
  {
    key: "admin",
    name: "Administrator",
    scope: "org",
    permissions: ["rbac.role.read", "rbac.role.manage", "member.read", "member.invite"],
  },
  { key: "member", name: "Member", scope: "org", permissions: ["member.read"] },
  { key: "guest", name: "Guest", scope: "org", permissions: [] },
]);

const KEYS: readonly string[] = Object.freeze(ROLES.map((definition) => definition.key));

export class SystemRoleSeed extends BaseRepository {
  // Idempotent: safe to run on every deploy. Per organization, because system roles
  // are rows in a tenant's table rather than global constants.
  public async run(organizationId: OrganizationId): Promise<void> {
    // Write first, read after: `on conflict do nothing` makes one statement correct for a
    // tenant that has these rows and for one that does not, which a per-role check is not.
    await this.db
      .insert(roles)
      .values(
        ROLES.map((definition) => ({
          id: Uuid.v7(),
          organizationId,
          key: definition.key,
          name: definition.name,
          scope: definition.scope,
          isSystem: true,
        })),
      )
      .onConflictDoNothing({ target: [roles.organizationId, roles.key] });

    // One `IN` for all four ids, including any a concurrent seed inserted a moment ago —
    // which is why this reads the table rather than trusting the ids generated above.
    const rows = await this.db
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), inArray(roles.key, KEYS)));

    const idByKey = new Map(rows.map((row) => [row.key, row.id]));

    const grants = ROLES.flatMap((definition) => {
      const roleId = idByKey.get(definition.key);
      if (!roleId) return [];

      // Resolved at seed time, so every permission a feature adds reaches owners on
      // the next deploy. That is why the seed must re-run rather than run once.
      const permissions =
        definition.permissions === "all"
          ? PermissionRegistry.instance.all()
          : definition.permissions;

      return permissions.map((permission) => ({ organizationId, roleId, permission }));
    });

    if (grants.length === 0) return;

    await this.db.insert(rolePermissions).values(grants).onConflictDoNothing();
  }
}

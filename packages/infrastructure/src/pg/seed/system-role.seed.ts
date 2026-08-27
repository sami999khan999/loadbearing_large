import {
  and,
  eq,
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

export class SystemRoleSeed extends BaseRepository {
  // Only `owner` is a wildcard. A role that grants "everything in module X" keeps
  // granting new things as X grows — that is how a reviewer acquires write access.
  private static readonly ROLES: readonly SystemRole[] = [
    { key: "owner", name: "Owner", scope: "org", permissions: "all" },
    {
      key: "admin",
      name: "Administrator",
      scope: "org",
      permissions: ["rbac.role.read", "rbac.role.manage", "member.read", "member.invite"],
    },
    { key: "member", name: "Member", scope: "org", permissions: ["member.read"] },
    { key: "guest", name: "Guest", scope: "org", permissions: [] },
  ];

  // Idempotent: safe to run on every deploy. Per organization, because system roles
  // are rows in a tenant's table rather than global constants.
  public async run(organizationId: OrganizationId): Promise<void> {
    for (const definition of SystemRoleSeed.ROLES) {
      const existing = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.organizationId, organizationId), eq(roles.key, definition.key)))
        .limit(1);

      const roleId = existing[0]?.id ?? Uuid.v7();

      if (!existing[0]) {
        await this.db.insert(roles).values({
          id: roleId,
          organizationId,
          key: definition.key,
          name: definition.name,
          scope: definition.scope,
          isSystem: true,
        });
      }

      // Resolved at seed time, so every permission a feature adds reaches owners on
      // the next deploy. That is why the seed must re-run rather than run once.
      const permissions =
        definition.permissions === "all"
          ? PermissionRegistry.instance.all()
          : definition.permissions;

      if (permissions.length === 0) continue;

      await this.db
        .insert(rolePermissions)
        .values(permissions.map((permission) => ({ organizationId, roleId, permission })))
        .onConflictDoNothing();
    }
  }
}

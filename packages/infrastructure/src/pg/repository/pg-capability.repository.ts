import {
  and,
  type CapabilityRepository,
  CapabilitySet,
  type CapabilitySetDto,
  eq,
  type OrganizationId,
  type PermissionKey,
  PermissionRegistry,
  type ScopedSetDto,
  type UserId,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { goalMembers, memberships, permissionOverrides, rolePermissions } from "../schema/index.js";

interface MutableScoped {
  grants: Set<PermissionKey>;
  denies: Set<PermissionKey>;
}

export class PgCapabilityRepository extends BaseRepository implements CapabilityRepository {
  // Org grants + goal grants + per-user overrides, deny winning. Three targeted
  // queries, not one join: the join is a cartesian product needing dedup in code.
  public async resolveFor(organizationId: OrganizationId, userId: UserId): Promise<CapabilitySet> {
    const registry = PermissionRegistry.instance;

    const org: MutableScoped = { grants: new Set(), denies: new Set() };
    const goals = new Map<string, MutableScoped>();
    const scopedFor = (goalId: string): MutableScoped => {
      const existing = goals.get(goalId);
      if (existing) return existing;
      const created: MutableScoped = { grants: new Set(), denies: new Set() };
      goals.set(goalId, created);
      return created;
    };

    const orgRows = await this.db
      .select({ permission: rolePermissions.permission })
      .from(memberships)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, memberships.roleId))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));

    for (const row of orgRows) {
      if (registry.isKnown(row.permission)) org.grants.add(row.permission);
    }

    const goalRows = await this.db
      .select({ goalId: goalMembers.goalId, permission: rolePermissions.permission })
      .from(goalMembers)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, goalMembers.roleId))
      .where(and(eq(goalMembers.organizationId, organizationId), eq(goalMembers.userId, userId)));

    for (const row of goalRows) {
      if (registry.isKnown(row.permission)) scopedFor(row.goalId).grants.add(row.permission);
    }

    const overrideRows = await this.db
      .select()
      .from(permissionOverrides)
      .where(
        and(
          eq(permissionOverrides.organizationId, organizationId),
          eq(permissionOverrides.userId, userId),
        ),
      );

    // Every raw string passes isKnown() before it is trusted, so a stale row can
    // never grant a capability the registry no longer defines.
    for (const row of overrideRows) {
      if (!registry.isKnown(row.permission)) continue;
      const target = row.goalId ? scopedFor(row.goalId) : org;
      if (row.effect === "deny") target.denies.add(row.permission);
      else target.grants.add(row.permission);
    }

    const freeze = (scoped: MutableScoped): ScopedSetDto => ({
      grants: [...scoped.grants],
      denies: [...scoped.denies],
    });

    const dto: CapabilitySetDto = {
      wildcard: false,
      org: freeze(org),
      goals: Object.fromEntries([...goals].map(([id, scoped]) => [id, freeze(scoped)])),
    };

    return CapabilitySet.from(dto);
  }
}

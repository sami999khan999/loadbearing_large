import {
  and,
  type CapabilityRepository,
  CapabilitySet,
  type CapabilitySetDto,
  eq,
  isNull,
  type OrganizationId,
  type PermissionKey,
  PermissionRegistry,
  type Placement,
  type ScopedSetDto,
  type UserId,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import {
  goalMembers,
  memberships,
  organizations,
  permissionOverrides,
  rolePermissions,
} from "../schema/index.js";

interface MutableScoped {
  grants: Set<PermissionKey>;
  denies: Set<PermissionKey>;
}

export class PgCapabilityRepository extends BaseRepository implements CapabilityRepository {
  // RBAC — read on every request, before a key is known.
  protected override readonly placement: Placement = "catalog";

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
      // Deactivated grants nothing. Defence in depth: `PrincipalBuilder` already
      // refuses the session, and this is what a bypass of it would still hit.
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, userId),
          isNull(memberships.deactivatedAt),
        ),
      );

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

  // Two queries against the one organization marked `is_platform`, filtered to keys the
  // registry calls platform-scoped — a tenant key granted there reaches no axis at all.
  public async resolvePlatformFor(userId: UserId): Promise<CapabilitySet> {
    const registry = PermissionRegistry.instance;
    const grants = new Set<PermissionKey>();
    const denies = new Set<PermissionKey>();

    const grantRows = await this.db
      .select({ permission: rolePermissions.permission })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, memberships.roleId))
      // Deactivated grants nothing, here most of all: removing someone's platform rights
      // is deactivating their membership in the tier.
      .where(
        and(
          eq(organizations.isPlatform, true),
          eq(memberships.userId, userId),
          isNull(memberships.deactivatedAt),
        ),
      );

    for (const row of grantRows) {
      if (registry.isKnown(row.permission) && registry.scopeOf(row.permission) === "platform") {
        grants.add(row.permission);
      }
    }

    // A platform deny for one user, on the tier's own organization. `goal_id` is ignored:
    // a platform key has no goal level, and a row carrying one is a mis-write.
    const overrideRows = await this.db
      .select({
        permission: permissionOverrides.permission,
        effect: permissionOverrides.effect,
      })
      .from(permissionOverrides)
      .innerJoin(organizations, eq(organizations.id, permissionOverrides.organizationId))
      .where(and(eq(organizations.isPlatform, true), eq(permissionOverrides.userId, userId)));

    for (const row of overrideRows) {
      if (!registry.isKnown(row.permission)) continue;
      if (registry.scopeOf(row.permission) !== "platform") continue;
      if (row.effect === "deny") denies.add(row.permission);
      else grants.add(row.permission);
    }

    return CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: [...grants], denies: [...denies] },
    });
  }
}

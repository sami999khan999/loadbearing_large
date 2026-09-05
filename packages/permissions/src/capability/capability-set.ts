// The direct file, not `../registry/index.js`: that barrel loads `module-registry.ts`,
// which imports this folder back.
import { type PermissionKey, PermissionRegistry } from "../registry/permission-registry.js";

export interface ScopedSetDto {
  readonly grants: readonly PermissionKey[];
  readonly denies: readonly PermissionKey[];
}

export interface CapabilitySetDto {
  readonly wildcard: boolean;
  readonly org: ScopedSetDto;
  readonly goals: Readonly<Record<string, ScopedSetDto>>;
}

class ScopedSet {
  private readonly grants: ReadonlySet<PermissionKey>;
  private readonly denies: ReadonlySet<PermissionKey>;

  public constructor(dto: ScopedSetDto) {
    this.grants = new Set(dto.grants);
    this.denies = new Set(dto.denies);
  }

  public grantsPermission(p: PermissionKey): boolean {
    return this.grants.has(p);
  }

  public deniesPermission(p: PermissionKey): boolean {
    return this.denies.has(p);
  }
}

// Resolved capabilities for one principal — user or API key, same shape.
export class CapabilitySet {
  private readonly orgSet: ScopedSet;
  private readonly goalSets: ReadonlyMap<string, ScopedSet>;

  private constructor(private readonly dto: CapabilitySetDto) {
    this.orgSet = new ScopedSet(dto.org);
    this.goalSets = new Map(
      Object.entries(dto.goals).map(([id, s]): [string, ScopedSet] => [id, new ScopedSet(s)]),
    );
  }

  // The only way in, so the vocabulary boundary belongs here — a DTO also arrives from
  // Redis and from SSR, not just the database. The *sanitised* DTO is what gets stored.
  public static from(dto: CapabilitySetDto): CapabilitySet {
    return new CapabilitySet(CapabilitySet.sanitised(dto));
  }

  public static empty(): CapabilitySet {
    return new CapabilitySet({ wildcard: false, org: { grants: [], denies: [] }, goals: {} });
  }

  private static union(a: readonly PermissionKey[], b: readonly PermissionKey[]): PermissionKey[] {
    return [...new Set([...a, ...b])];
  }

  private static known(keys: readonly PermissionKey[]): PermissionKey[] {
    return keys.filter((key) => PermissionRegistry.instance.isKnown(key));
  }

  private static scopedSet(dto: ScopedSetDto): ScopedSetDto {
    return { grants: CapabilitySet.known(dto.grants), denies: CapabilitySet.known(dto.denies) };
  }

  // Goal keys survive an emptied set — `intersect()` unions goal keys across both sides.
  private static sanitised(dto: CapabilitySetDto): CapabilitySetDto {
    return {
      wildcard: dto.wildcard,
      org: CapabilitySet.scopedSet(dto.org),
      goals: Object.fromEntries(
        Object.entries(dto.goals).map(([id, set]): [string, ScopedSetDto] => [
          id,
          CapabilitySet.scopedSet(set),
        ]),
      ),
    };
  }

  // Deny by default; an explicit deny beats every grant, wildcard included. An undefined
  // permission is denied rather than thrown on — a `TypeError` here would be a 500.
  public can(permission: PermissionKey, goalId?: string): boolean {
    const scope = PermissionRegistry.instance.scopeOf(permission);
    if (!scope) return false;

    if (scope === "goal") {
      if (!goalId) return false;
      const goal = this.goalSets.get(goalId);
      if (goal?.deniesPermission(permission)) return false;
      if (this.orgSet.deniesPermission(permission)) return false;
      if (this.dto.wildcard) return true;
      return (
        (goal?.grantsPermission(permission) ?? false) || this.orgSet.grantsPermission(permission)
      );
    }

    return this.allowsAtOrg(permission);
  }

  public canAll(permissions: readonly PermissionKey[], goalId?: string): boolean {
    return permissions.every((p) => this.can(p, goalId));
  }

  public canAny(permissions: readonly PermissionKey[], goalId?: string): boolean {
    return permissions.some((p) => this.can(p, goalId));
  }

  // The candidate set is required because this object cannot produce it: a wildcard or
  // org-level grant holds the permission in goals its own DTO never names.
  public goalsWith(permission: PermissionKey, amongGoalIds: readonly string[]): readonly string[] {
    return [...new Set(amongGoalIds)].filter((id) => this.can(permission, id));
  }

  // Denies union, grants intersect, goal keys union — see docs/reference/capability-set.md.
  // Org candidates use `allowsAtOrg`, not `can()`.
  public intersect(other: CapabilitySet): CapabilitySet {
    const goalIds = new Set([...Object.keys(this.dto.goals), ...Object.keys(other.dto.goals)]);
    const orgCandidates = CapabilitySet.union(this.dto.org.grants, other.dto.org.grants);

    return CapabilitySet.from({
      wildcard: this.dto.wildcard && other.dto.wildcard,
      org: {
        grants: orgCandidates.filter((p) => this.allowsAtOrg(p) && other.allowsAtOrg(p)),
        denies: CapabilitySet.union(this.dto.org.denies, other.dto.org.denies),
      },
      goals: Object.fromEntries(
        [...goalIds].map((goalId): [string, ScopedSetDto] => {
          const mine = this.dto.goals[goalId];
          const theirs = other.dto.goals[goalId];

          return [
            goalId,
            {
              grants: CapabilitySet.union(mine?.grants ?? [], theirs?.grants ?? []).filter(
                (p) => this.can(p, goalId) && other.can(p, goalId),
              ),
              denies: CapabilitySet.union(mine?.denies ?? [], theirs?.denies ?? []),
            },
          ];
        }),
      ),
    });
  }

  public toJSON(): CapabilitySetDto {
    return this.dto;
  }

  // `can()` for an org-scoped permission — and the org half of a goal-scoped one.
  private allowsAtOrg(permission: PermissionKey): boolean {
    if (this.orgSet.deniesPermission(permission)) return false;
    if (this.dto.wildcard) return true;
    return this.orgSet.grantsPermission(permission);
  }
}

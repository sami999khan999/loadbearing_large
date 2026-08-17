import { type PermissionKey, PermissionRegistry } from "./permission-registry.js";

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

/** Resolved capabilities for one principal — user or API key, same shape. */
export class CapabilitySet {
  private readonly orgSet: ScopedSet;
  private readonly goalSets: ReadonlyMap<string, ScopedSet>;

  private constructor(private readonly dto: CapabilitySetDto) {
    this.orgSet = new ScopedSet(dto.org);
    this.goalSets = new Map(
      Object.entries(dto.goals).map(([id, s]): [string, ScopedSet] => [id, new ScopedSet(s)]),
    );
  }

  public static from(dto: CapabilitySetDto): CapabilitySet {
    return new CapabilitySet(dto);
  }

  public static empty(): CapabilitySet {
    return new CapabilitySet({ wildcard: false, org: { grants: [], denies: [] }, goals: {} });
  }

  private static union(a: readonly PermissionKey[], b: readonly PermissionKey[]): PermissionKey[] {
    return [...new Set([...a, ...b])];
  }

  /** Deny by default. An explicit deny beats every grant, including the wildcard. */
  public can(permission: PermissionKey, goalId?: string): boolean {
    if (PermissionRegistry.instance.scopeOf(permission) === "goal") {
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

  /** Goals in which this principal holds a given goal-scoped permission. */
  public goalsWith(permission: PermissionKey): readonly string[] {
    return [...this.goalSets.keys()].filter((id) => this.can(permission, id));
  }

  /**
   * Narrow this set to the intersection with another. Used when an API key's
   * scopes are re-intersected with its issuer's live capabilities at resolution.
   *
   * Three properties this has to hold, because it is a security boundary and not
   * a convenience:
   *
   * - **Denies union, grants intersect.** A deny on either side survives. Keeping
   *   only `this`'s denies lets two wildcard sets produce a set that grants what
   *   one of them explicitly refused.
   * - **Goal keys union.** A goal the other side denies inside but `this` has
   *   never heard of must still appear in the result, or the deny is discarded.
   * - **Both sides' grants are candidates**, each kept only if both sides allow
   *   it. Filtering `this`'s grants alone is wrong whenever `this` holds the
   *   wildcard: it grants everything and lists nothing, so the intersection
   *   would come out empty instead of equal to the other side.
   *
   * Org candidates are tested with `allowsAtOrg`, not `can()`. An org-level grant
   * of a *goal*-scoped permission is real, but `can(p)` with no `goalId` is
   * `false` by rule 3 — asking it here would drop the grant and make `intersect`
   * non-idempotent.
   */
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

  /** `can()` for an org-scoped permission — and the org half of a goal-scoped one. */
  private allowsAtOrg(permission: PermissionKey): boolean {
    if (this.orgSet.deniesPermission(permission)) return false;
    if (this.dto.wildcard) return true;
    return this.orgSet.grantsPermission(permission);
  }
}

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

  /**
   * The only way in, and therefore where the vocabulary boundary belongs.
   *
   * A DTO reaches here from three places — the database, a Redis cache entry, and
   * an SSR payload — and only the first has already been filtered through
   * `isKnown()`. Re-filtering makes that boundary hold on every path instead of
   * one, so a cache entry written before a permission was deleted (or a tampered
   * one) cannot put a key into a grant set.
   *
   * The *sanitised* DTO is what gets stored, not the caller's: `toJSON()` returns
   * it by reference, so keeping the original would write the unknown keys straight
   * back out to Redis on the next cache fill.
   */
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

  /**
   * Goal keys survive even when every permission inside one was dropped — an empty
   * goal entry is meaningful to `intersect()`, which unions goal keys across both
   * sides.
   */
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

  /**
   * Deny by default. An explicit deny beats every grant, including the wildcard.
   *
   * A permission the catalog does not define is denied rather than thrown on. The
   * type rules that out at compile time, but a cast or a stale DTO can still get
   * one here at runtime, and a `TypeError` from a permission check means a 500
   * where the honest answer was a 403.
   */
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

  /**
   * Which of `amongGoalIds` this principal holds `permission` in.
   *
   * The candidate set is a required parameter because this object cannot produce
   * it. It knows only the goals its own DTO names, and two principal shapes hold a
   * goal-scoped permission in goals that never appear there: a wildcard holder,
   * and anyone granted the permission at org level. Filtering `this.goalSets`
   * answered `[]` for both while `can()` answered `true` — which fed an empty
   * permitted scope into `VectorStore.search()`, where empty means org-wide chunks
   * only. A superuser got no goal-scoped results and no error.
   *
   * Passing the scope in also mirrors `VectorStore.search()` itself: the permitted
   * set sits in the signature so a caller cannot forget to compute it.
   */
  public goalsWith(permission: PermissionKey, amongGoalIds: readonly string[]): readonly string[] {
    return [...new Set(amongGoalIds)].filter((id) => this.can(permission, id));
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

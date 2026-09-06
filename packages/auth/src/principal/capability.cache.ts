import {
  type CacheStore,
  type CapabilityRepository,
  CapabilitySet,
  type CapabilitySetDto,
  type OrganizationId,
  type UserId,
} from "../import.js";

// `resolveFor` is three queries and runs on essentially every request. Fine at ten users,
// not at five hundred.
export class CapabilityCache {
  private static readonly PREFIX = "capability:user:";

  // A backstop for a forgotten invalidation, not the mechanism, and a revocation window
  // rather than a hit-rate dial. See docs/reference/capability-cache.md.
  private static readonly TTL_SECONDS = 60;

  public constructor(
    private readonly repository: CapabilityRepository,
    private readonly cache: CacheStore,
  ) {}

  public async forUser(organizationId: OrganizationId, userId: UserId): Promise<CapabilitySet> {
    const key = CapabilityCache.keyFor(organizationId, userId);

    const cached = await this.cache.get<CapabilitySetDto>(key);
    if (cached) return CapabilitySet.from(cached);

    const resolved = await this.repository.resolveFor(organizationId, userId);
    await this.cache.set(key, resolved.toJSON(), CapabilityCache.TTL_SECONDS);
    return resolved;
  }

  // Called on every RBAC write. Stale in this direction means a revoked permission keeps
  // working — a security bug wearing a caching bug's clothes.
  public async invalidate(organizationId: OrganizationId, userId: UserId): Promise<void> {
    await this.cache.delete(CapabilityCache.keyFor(organizationId, userId));
  }

  // A role edit affects everyone holding it, and the holders are not known here —
  // cheaper to flush the tenant than to enumerate them, and never wider than one.
  public async invalidateOrganization(organizationId: OrganizationId): Promise<void> {
    await this.cache.deletePrefix(`${CapabilityCache.PREFIX}${organizationId}:`);
  }

  // The organization sits between prefix and user id: in the key or a user in two of them
  // gets whichever set cached first, and in that position or `deletePrefix` breaks.
  private static keyFor(organizationId: OrganizationId, userId: UserId): string {
    return `${CapabilityCache.PREFIX}${organizationId}:${userId}`;
  }
}

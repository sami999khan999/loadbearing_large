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

  // Sixty seconds, and no longer. The TTL is a backstop for an invalidation somebody
  // forgot, not the mechanism — raising it because the hit rate looks better trades a
  // security window for a metric.
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

  // Called on every RBAC write, not as an optimization: getting this wrong in the stale
  // direction means a revoked permission keeps working, which is a security bug wearing a
  // caching bug's clothes.
  public async invalidate(organizationId: OrganizationId, userId: UserId): Promise<void> {
    await this.cache.delete(CapabilityCache.keyFor(organizationId, userId));
  }

  // A role edit affects everyone holding it — cheaper to flush than to enumerate.
  public async invalidateAll(): Promise<void> {
    await this.cache.deletePrefix(CapabilityCache.PREFIX);
  }

  // The organization sits between the fixed prefix and the user id: it has to be in the
  // key, because a user in two organizations would otherwise get whichever capability set
  // was cached first — a cross-tenant privilege bug with a one-minute fuse and no error
  // anywhere — and it has to be in that position, or `deletePrefix` stops meaning anything.
  private static keyFor(organizationId: OrganizationId, userId: UserId): string {
    return `${CapabilityCache.PREFIX}${organizationId}:${userId}`;
  }
}

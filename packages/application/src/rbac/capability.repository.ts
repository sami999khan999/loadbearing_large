import type { CapabilitySet, OrganizationId, UserId } from "../import.js";

// A repository port, so it lives with its subject rather than in `port/` — one
// file per slice there would grow forever.
export abstract class CapabilityRepository {
  // Both branded: two opaque uuids in a row, so a swap compiles and returns a
  // confidently wrong `CapabilitySet` rather than an error.
  public abstract resolveFor(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<CapabilitySet>;

  // Keyed on the user alone: the tier is one organization, and the answer does not
  // change with whichever tenant the session is pointed at. **Only** the platform axis.
  public abstract resolvePlatformFor(userId: UserId): Promise<CapabilitySet>;
}

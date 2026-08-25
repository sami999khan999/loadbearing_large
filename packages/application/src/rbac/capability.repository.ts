import type { CapabilitySet, OrganizationId } from "../import.js";

// A repository port, so it lives with its subject rather than in `port/` — one
// file per slice there would grow forever.
export abstract class CapabilityRepository {
  // `userId` is a plain string, not a branded `UserId`: Better Auth owns the user
  // table and generates its own identifier format.
  public abstract resolveFor(
    organizationId: OrganizationId,
    userId: string,
  ): Promise<CapabilitySet>;
}

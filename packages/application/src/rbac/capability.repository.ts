import type { CapabilitySet, OrganizationId, UserId } from "../import.js";

// A repository port, so it lives with its subject rather than in `port/` — one
// file per slice there would grow forever.
export abstract class CapabilityRepository {
  // Both arguments branded, and both for the same reason: they are two opaque uuids in a
  // row, so a swap compiles and returns a confidently wrong `CapabilitySet` rather than
  // an error. `UserId` holds here because the auth library is configured to mint
  // `Uuid.v7()` ids (16) — it was a plain string while the user table owned its own format.
  public abstract resolveFor(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<CapabilitySet>;
}

import type { OrganizationId, UserId } from "../import.js";

// Creates a tenant and makes one person its owner. The personal enroller and the
// "New organization" endpoint are the same operation with a different name on the row,
// and a second copy of the seed-and-own logic would be a second permission model.
export abstract class OrganizationFounder {
  public abstract found(userId: UserId, name: string): Promise<OrganizationId>;
}

import type { OrganizationId, UserId } from "../import.js";

// Creates a tenant and makes one person its owner. One implementation, because a second
// copy of the seed-and-own logic would be a second permission model.
export abstract class OrganizationFounder {
  public abstract found(userId: UserId, name: string): Promise<OrganizationId>;
}

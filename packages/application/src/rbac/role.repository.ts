import type { OrganizationId, PaginationQuery, RoleId } from "../import.js";

// One role and the permission keys it grants. Deliberately not a `CapabilitySet`: this
// is what a *role* grants, not what a principal can do — the second is the first plus
// goal memberships plus per-user overrides, and conflating them is how a permission
// matrix ends up showing the wrong answer with total confidence.
export interface RoleRecord {
  readonly id: RoleId;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly scope: "org" | "goal";
  readonly isSystem: boolean;
  // Raw strings from `role_permissions`, unfiltered. The registry is what decides
  // whether one is still a permission; a repository that dropped unknown keys would
  // hide a rename rather than surface it.
  readonly permissions: readonly string[];
}

export interface RolePage {
  readonly items: readonly RoleRecord[];
  readonly total: number;
}

// A repository port, so it lives with its subject rather than in `port/` — one file per
// slice there would grow forever.
export abstract class RoleRepository {
  // Takes the tenant explicitly rather than a `Principal`: the use-case is where
  // authorization happens, and a repository that could read a principal would sooner or
  // later decide something with it.
  public abstract list(organizationId: OrganizationId, page: PaginationQuery): Promise<RolePage>;
}

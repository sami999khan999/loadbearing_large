import type { OrganizationId, PaginationQuery, RoleId } from "../import.js";

// What a *role* grants, deliberately not a `CapabilitySet` — that is this plus goal
// memberships plus per-user overrides, and conflating them shows a wrong matrix.
export interface RoleRecord {
  readonly id: RoleId;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly scope: "org" | "goal";
  readonly isSystem: boolean;
  // Raw and unfiltered: a repository that dropped unknown keys would hide a rename
  // rather than surface it. The registry decides.
  readonly permissions: readonly string[];
}

export interface RolePage {
  readonly items: readonly RoleRecord[];
  readonly total: number;
}

// A repository port, so it lives with its subject rather than in `port/` — one file per
// slice there would grow forever.
export abstract class RoleRepository {
  // The tenant explicitly, never a `Principal`: a repository that could read one would
  // sooner or later decide something with it.
  public abstract list(organizationId: OrganizationId, page: PaginationQuery): Promise<RolePage>;

  // Under the tenant, so a role id from another organization is null — which is what
  // lets an invitation trust the id it was handed.
  public abstract findById(
    organizationId: OrganizationId,
    roleId: RoleId,
  ): Promise<RoleRecord | null>;
}

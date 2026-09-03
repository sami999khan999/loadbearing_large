import type { OrganizationId, PaginationQuery, RoleId, UserId } from "../import.js";

// One person's membership of the tenant, joined to what a list needs to render it.
export interface MemberRecord {
  readonly userId: UserId;
  readonly name: string;
  readonly email: string;
  readonly roleId: RoleId;
  readonly roleKey: string;
  readonly roleName: string;
  readonly joinedAt: Date;
  readonly deactivated: boolean;
}

export interface MemberPage {
  readonly items: readonly MemberRecord[];
  readonly total: number;
}

// A repository port, so it lives with its subject rather than in `port/`.
export abstract class MemberRepository {
  // Takes the tenant explicitly rather than a `Principal`, as `RoleRepository` does:
  // the use-case is where authorization happens.
  public abstract list(organizationId: OrganizationId, page: PaginationQuery): Promise<MemberPage>;

  // Whether an address already belongs to someone in the tenant. Compared
  // case-insensitively by the adapter, so the caller need not normalise.
  public abstract existsByEmail(organizationId: OrganizationId, email: string): Promise<boolean>;
}

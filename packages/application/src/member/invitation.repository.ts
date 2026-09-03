import type { InvitationId, OrganizationId, PaginationQuery, RoleId, UserId } from "../import.js";

// What `save` takes: everything the row needs, decided by the use-case. The token is
// here and nowhere else in this file — once stored it is read back only by the
// claimer in `auth`, never by anything that lists invitations.
export interface NewInvitation {
  readonly id: InvitationId;
  readonly organizationId: OrganizationId;
  readonly email: string;
  readonly roleId: RoleId;
  readonly token: string;
  readonly invitedBy: UserId;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

// What a read returns: the row joined to the names a list and a mail need. No token
// and no tenant id — the tenant is the query's scope, and the token is not for reading.
export interface InvitationRecord {
  readonly id: InvitationId;
  readonly email: string;
  readonly roleId: RoleId;
  readonly roleName: string;
  readonly invitedBy: UserId;
  readonly inviterName: string;
  readonly organizationName: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface InvitationPage {
  readonly items: readonly InvitationRecord[];
  readonly total: number;
}

// A repository port, so it lives with its subject rather than in `port/`.
export abstract class InvitationRepository {
  // Pending and unexpired only — what an administrator can still act on.
  public abstract list(
    organizationId: OrganizationId,
    page: PaginationQuery,
  ): Promise<InvitationPage>;

  // Expired rows included, so a stale one can still be revoked by id.
  public abstract findById(
    organizationId: OrganizationId,
    id: InvitationId,
  ): Promise<InvitationRecord | null>;

  // Upserts on `(organization_id, email)`: inviting an address a second time replaces
  // the pending invitation — new token, new role, new expiry — rather than failing.
  public abstract save(invitation: NewInvitation): Promise<void>;

  public abstract delete(organizationId: OrganizationId, id: InvitationId): Promise<void>;
}

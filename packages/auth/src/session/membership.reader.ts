import type { OrganizationId, UserId } from "../import.js";

// One tenant a user may switch to, as the switcher renders it.
export interface OrganizationSummary {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
}

// Answers one question, asked once per sign-in: which organization is this session for?
// And, since organizations can be switched, the two questions a switch needs.
//
// Declared here rather than in `application` for the same reason `ApiKeyRepository` is —
// it exists to populate an authentication artifact, and no use-case should learn that
// sessions have an organization column. Implemented in `infrastructure` as
// `PgMembershipReader`, which cannot import this file (`auth` already depends on it);
// the binding is checked where the two meet, in `Container` (17).
export abstract class MembershipReader {
  // Null when the user holds no membership. That has to fail the sign-in rather than
  // mint a session with no tenant — a `Principal` without an organization would read
  // every tenant's rows, and nothing downstream is positioned to notice.
  //
  // Prefers `users.last_active_organization_id` while the user is still a member of
  // it, so a sign-in lands where the last session left off; the oldest membership
  // otherwise.
  public abstract activeOrganizationFor(userId: UserId): Promise<OrganizationId | null>;

  // The switch endpoint's entire authorization: a session may only be rebound to a
  // tenant this user holds a membership in.
  public abstract isMember(userId: UserId, organizationId: OrganizationId): Promise<boolean>;

  // Every tenant the user may switch to, oldest first. Read once per SSR pass.
  public abstract organizationsFor(userId: UserId): Promise<readonly OrganizationSummary[]>;
}

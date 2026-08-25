import type { OrganizationId, UserId } from "../import.js";

// Answers one question, asked once per sign-in: which organization is this session for?
//
// Declared here rather than in `application` for the same reason `ApiKeyRepository` is —
// it exists to populate an authentication artifact, and no use-case should learn that
// sessions have an organization column. Implemented in `db` as `PgMembershipReader`,
// which cannot import this file (`auth` already depends on `db`); the binding is checked
// where the two meet, in `Container` (17).
export abstract class MembershipReader {
  // Null when the user holds no membership. That has to fail the sign-in rather than
  // mint a session with no tenant — a `Principal` without an organization would read
  // every tenant's rows, and nothing downstream is positioned to notice.
  public abstract activeOrganizationFor(userId: UserId): Promise<OrganizationId | null>;
}

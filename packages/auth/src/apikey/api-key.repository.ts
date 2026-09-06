import type { OrganizationId, UserId } from "../import.js";

export interface ApiKeyRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly issuerId: UserId;
  readonly tokenHash: string;
  // Raw strings from the database. Filtered through the registry before they are trusted.
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

// Declared here, not in `application`: a key is an authentication artifact and no
// use-case should learn keys exist. See docs/reference/api-key.md.
export abstract class ApiKeyRepository {
  public abstract findByPrefix(prefix: string): Promise<readonly ApiKeyRecord[]>;
  public abstract touch(id: string, at: Date): Promise<void>;
}

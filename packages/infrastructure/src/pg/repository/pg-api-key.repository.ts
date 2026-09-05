import { eq, type OrganizationId, type UserId } from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { apiKeys } from "../schema/index.js";

// Satisfied structurally, because `auth` depends on this package and the arrow cannot
// point back. See docs/reference/enrollers.md.
export interface ApiKeyRow {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly issuerId: UserId;
  readonly tokenHash: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export class PgApiKeyRepository extends BaseRepository {
  // Not tenant-scoped, and it cannot be: the organization is what this lookup
  // *establishes*, from a bare header with no principal behind it yet.
  public async findByPrefix(prefix: string): Promise<readonly ApiKeyRow[]> {
    const rows = await this.db
      .select({
        id: apiKeys.id,
        organizationId: apiKeys.organizationId,
        issuerId: apiKeys.issuerId,
        tokenHash: apiKeys.tokenHash,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.prefix, prefix));

    return rows.map((row) => ({ ...row, organizationId: row.organizationId as OrganizationId }));
  }

  // A write on the read path, which is why it is a single-column update on a primary key
  // and nothing more.
  public async touch(id: string, at: Date): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
  }
}

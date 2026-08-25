import {
  CapabilitySet,
  type OrganizationId,
  type PermissionKey,
  PermissionRegistry,
  Principal,
  type UserId,
} from "../import.js";
import type { CapabilityCache } from "../principal/capability.cache.js";
import { ApiKeyHasher } from "./api-key.hasher.js";

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

// Declared here rather than in `application`, deliberately: an API key is an
// authentication artifact, not a domain entity, and nothing in `application` should learn
// that keys exist. Implemented in `db` as `PgApiKeyRepository`, which cannot import this
// file — `auth` already depends on `db` — so the binding is checked in `Container` (17).
export abstract class ApiKeyRepository {
  public abstract findByPrefix(prefix: string): Promise<readonly ApiKeyRecord[]>;
  public abstract touch(id: string, at: Date): Promise<void>;
}

export class ApiKeyResolver {
  public constructor(
    private readonly repository: ApiKeyRepository,
    private readonly capabilities: CapabilityCache,
  ) {}

  public async resolve(token: string): Promise<Principal | null> {
    const hash = await ApiKeyHasher.hash(token);
    const candidates = await this.repository.findByPrefix(ApiKeyHasher.prefixOf(token));

    const record = candidates.find((candidate) =>
      ApiKeyHasher.timingSafeEqual(candidate.tokenHash, hash),
    );
    if (!record) return null;

    const now = new Date();
    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt <= now) return null;

    const registry = PermissionRegistry.instance;
    const scoped = record.scopes.filter((scope): scope is PermissionKey => registry.isKnown(scope));

    const declared = CapabilitySet.from({
      wildcard: false,
      org: { grants: scoped, denies: [] },
      goals: {},
    });

    // Re-intersected on every request, not frozen at creation. This is the part that
    // matters: with frozen scopes, revoking the issuer's `finance.read.global` leaves
    // every key they ever issued still reading finance — and nobody notices, because the
    // key still works. Re-intersecting means revoking a person narrows their keys with them.
    const issuer = await this.capabilities.forUser(record.organizationId, record.issuerId);
    const effective = declared.intersect(issuer);

    await this.repository.touch(record.id, now);
    return Principal.apiKey(record.organizationId, record.issuerId, effective);
  }
}

import { CapabilitySet, type PermissionKey, PermissionRegistry, Principal } from "../import.js";
import type { CapabilityCache } from "../principal/capability.cache.js";
import { ApiKeyHasher } from "./api-key.hasher.js";
import type { ApiKeyRepository } from "./api-key.repository.js";

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

    // Re-intersected per request, never frozen at creation: revoking a person has to
    // narrow every key they issued. See docs/reference/api-key.md.
    const issuer = await this.capabilities.forUser(record.organizationId, record.issuerId);
    const effective = declared.intersect(issuer);

    await this.repository.touch(record.id, now);
    return Principal.apiKey(record.organizationId, record.issuerId, effective);
  }
}

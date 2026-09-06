import type { ApiKeyResolver } from "../apikey/api-key.resolver.js";
import { Principal, type RequestHeaders, type SessionResolver } from "../import.js";
import type { MembershipReader } from "../session/membership.reader.js";
import type { CapabilityCache } from "./capability.cache.js";

// Four credential types collapse into one `Principal` here, so a single
// `Authorizer.assert()` serves every surface.
export class PrincipalBuilder {
  public constructor(
    private readonly sessions: SessionResolver,
    private readonly apiKeys: ApiKeyResolver,
    private readonly capabilities: CapabilityCache,
    private readonly memberships: MembershipReader,
  ) {}

  public async fromHeaders(headers: RequestHeaders): Promise<Principal | null> {
    // First, deliberately: checking the session first would silently upgrade a scoped key
    // to the issuer's full permissions. See docs/reference/principal-builder.md.
    const apiKey = headers.get("x-api-key");
    if (apiKey) return this.apiKeys.resolve(apiKey);

    const session = await this.sessions.resolve(headers);
    if (!session) return null;

    // Before the capabilities, because a deactivated membership is not a principal with
    // nothing granted — it is no principal at all. One row on `memberships_uq`.
    if (!(await this.memberships.isActive(session.userId, session.organizationId))) return null;

    const capabilities = await this.capabilities.forUser(session.organizationId, session.userId);
    return new Principal(session.organizationId, session.userId, capabilities, "user");
  }
}

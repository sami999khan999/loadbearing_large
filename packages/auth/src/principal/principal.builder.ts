import type { ApiKeyResolver } from "../apikey/api-key.resolver.js";
import { Principal, type RequestHeaders, type SessionResolver } from "../import.js";
import type { CapabilityCache } from "./capability.cache.js";

// Four credential types collapse into one `Principal` here, which is what lets a single
// `Authorizer.assert()` serve the web app, the desktop shell, the client portal, and an
// integration's API key.
export class PrincipalBuilder {
  public constructor(
    private readonly sessions: SessionResolver,
    private readonly apiKeys: ApiKeyResolver,
    private readonly capabilities: CapabilityCache,
  ) {}

  public async fromHeaders(headers: RequestHeaders): Promise<Principal | null> {
    // First, deliberately. A request carrying both a cookie and an `x-api-key` is an
    // integration calling through a browser context, and the key is the more specific
    // credential — checking the session first would silently upgrade a scoped key to the
    // issuer's full permissions.
    const apiKey = headers.get("x-api-key");
    if (apiKey) return this.apiKeys.resolve(apiKey);

    const session = await this.sessions.resolve(headers);
    if (!session) return null;

    const capabilities = await this.capabilities.forUser(session.organizationId, session.userId);
    return new Principal(session.organizationId, session.userId, capabilities, "user");
  }
}

import { InternalError } from "../import.js";
import type { AuthClient, BetterAuthClient } from "./auth.client.js";
import { BetterAuthErrorNormalizer } from "./better-auth-error-normalizer.js";

// What the three organization endpoints answer with.
export interface OrganizationSwitch {
  readonly organizationId: string;
}

// The three ways a session ends up pointing at a different tenant, reached through
// Better Auth's own transport because they are Better Auth endpoints — the plugin in
// `packages/auth` — and the session cookie they re-issue rides the same response.
//
// Takes the `AuthClient` rather than a config, as `AccountClient` does: one instance
// per component tree, one cookie handling, one plugin set.
export class OrganizationClient {
  private readonly client: BetterAuthClient;

  public constructor(auth: AuthClient) {
    this.client = auth.raw;
  }

  // Resolves once the session row, its Redis copy and the cookie cache all name the
  // new tenant. The caller still has to clear its own caches — every cached row
  // belongs to the tenant being left — which is why the query layer declares no
  // invalidation for this and the call site does what sign-out does.
  public switch(organizationId: string): Promise<OrganizationSwitch> {
    return this.post("/organization/switch", { organizationId });
  }

  public create(name: string): Promise<OrganizationSwitch> {
    return this.post("/organization/create", { name });
  }

  public acceptInvitation(token: string): Promise<OrganizationSwitch> {
    return this.post("/invitation/accept", { token });
  }

  // `$fetch` rather than a generated method: the plugin has no client half, on
  // purpose — three thin posts do not earn a second plugin to keep in step.
  private async post(path: string, body: Record<string, string>): Promise<OrganizationSwitch> {
    const response = await this.client.$fetch(path, { method: "POST", body });
    if (response.error) throw BetterAuthErrorNormalizer.normalize(response.error);

    // Narrowed by shape rather than by a generic on `$fetch`: the payload is whatever the
    // endpoint returned, and a guard is what keeps a changed plugin from becoming a
    // silently wrong `organizationId` downstream.
    const data: unknown = response.data;
    if (!OrganizationClient.isSwitch(data)) throw new InternalError();
    return data;
  }

  private static isSwitch(value: unknown): value is OrganizationSwitch {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { organizationId?: unknown }).organizationId === "string"
    );
  }
}

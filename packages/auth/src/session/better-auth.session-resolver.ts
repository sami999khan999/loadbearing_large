import type { AuthInstance } from "../auth.factory.js";
import {
  type OrganizationId,
  type RequestHeaders,
  type ResolvedSession,
  SessionResolver,
  type UserId,
} from "../import.js";

// The only place in the repository that names Better Auth's session API. Everything else
// depends on `SessionResolver`. Replacing the auth library rewrites this file and nothing
// else — which is the same reason `packages/auth` is a package rather than a folder in
// `apps/web/src/server/`.
export class BetterAuthSessionResolver extends SessionResolver {
  public constructor(private readonly auth: AuthInstance) {
    super();
  }

  // `getSession` handles cookie and bearer transparently; both arrive as headers.
  public override async resolve(headers: RequestHeaders): Promise<ResolvedSession | null> {
    // The cast is the one place this package leans on something the port does not promise.
    // `RequestHeaders` is deliberately narrow — `application` declares `{ get() }` rather
    // than naming a `Headers` it has no lib for — but Better Auth reads cookies by
    // iterating, so it needs the real thing. Every caller passes a genuine `Headers` (24,
    // 25); a hand-rolled stub with only `get` would typecheck here and fail at runtime.
    const result = await this.auth.api.getSession({ headers: headers as Headers });
    if (!result?.session) return null;

    // Pinned by the session-create hook (`auth.factory.ts`), so a session that predates
    // that hook — or one written by hand — has none. Treated as no session at all rather
    // than defaulted: guessing a tenant here is a cross-tenant read with no error.
    const { activeOrganizationId } = result.session as { activeOrganizationId?: string };
    if (!activeOrganizationId) return null;

    return {
      organizationId: activeOrganizationId as OrganizationId,
      userId: result.session.userId as UserId,
      sessionId: result.session.id,
      expiresAt: new Date(result.session.expiresAt),
    };
  }
}

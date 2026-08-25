import type { OrganizationId, UserId } from "../import.js";

// Structurally satisfied by a Web `Headers`, so `resolve(request.headers)` just works.
// Declared rather than named: `lib: ["ES2024"]` has no `Headers`, and adding @types/node
// to borrow one method would put Node's globals in a runtime-neutral package.
export interface RequestHeaders {
  get(name: string): string | null;
}

// The session carries its organization, because `PrincipalBuilder` is handed headers and
// nothing else — and a `Principal` cannot be built without a tenant. Resolving it per
// request instead would be a membership query on every call; pinning it at sign-in is one
// column. A user in two organizations gets two sessions, which is also what makes
// switching organizations an explicit act rather than an ambient one.
export interface ResolvedSession {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export abstract class SessionResolver {
  public abstract resolve(headers: RequestHeaders): Promise<ResolvedSession | null>;
}

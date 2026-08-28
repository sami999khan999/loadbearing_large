import type { OrganizationId, UserId } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SessionSnapshot } from "~/session-store.js";
import { container } from "./container.js";

const ANONYMOUS: SessionSnapshot = { user: null, capabilities: CapabilitySet.empty().toJSON() };

// A server function, and one of the few things doc 24 says one is *for*: it carries no
// business logic and makes no authorization decision. It resolves who is asking and what
// they may do, so the first rendered byte is already gated correctly. The decision itself
// still happens in `Authorizer.assert()` inside the use-case, where it always did.
//
// Not routed through `PrincipalBuilder`: that is the authorization path, it accepts an
// `x-api-key` ahead of the cookie, and an integration key has no name or email to render.
// This is the render path, and it reads a browser session or nothing at all.
export const fetchSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionSnapshot> => {
    const request = getRequest();
    const result = await container.auth.api.getSession({ headers: request.headers });

    if (!result?.session) return ANONYMOUS;

    // Pinned by the session-create hook in `AuthFactory`. A session without it is a
    // session with no tenant, and `BetterAuthSessionResolver` already treats that as no
    // session at all rather than guessing — this agrees with it deliberately, because a
    // shell that renders a user the server would refuse is worse than one that renders
    // nobody.
    const { activeOrganizationId } = result.session as { activeOrganizationId?: string };
    if (!activeOrganizationId) return ANONYMOUS;

    // The same cache `PrincipalBuilder` reads, keyed on `organization:user`, so the
    // client's `can()` and the server's `assert()` are answering off one set.
    const capabilities = await container.capabilities.forUser(
      activeOrganizationId as OrganizationId,
      result.session.userId as UserId,
    );

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      capabilities: capabilities.toJSON(),
    };
  },
);
